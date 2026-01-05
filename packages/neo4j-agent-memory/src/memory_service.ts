import { Neo4jClient } from "./neo4j/client.js";
import { ensureSchema } from "./neo4j/schema.js";
import type {
  MemoryServiceConfig,
  MemoryEvent,
  MemorySummary,
  ListMemoriesArgs,
  RetrieveContextArgs,
  ContextBundle,
  MemoryFeedback,
  MemoryFeedbackResult,
  CaptureEpisodeArgs,
  CaptureStepEpisodeArgs,
  SaveLearningRequest,
  SaveLearningResult,
  LearningCandidate,
  EnvironmentFingerprint,
  MemoryPolarity,
  CaseRecord,
  AutoRelateConfig,
  GetMemoriesByIdArgs,
  GetMemoryGraphArgs,
  MemoryGraphResponse,
  MemoryRecord,
} from "./types.js";
import { canonicaliseForHash, envHash, newId, normaliseSymptom, sha256Hex } from "./utils/hash.js";
import { cypher } from "./cypher/index.js";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function parseJsonField<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function toDateString(value: any): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value?.toString === "function") return value.toString();
  return String(value);
}

const DEFAULT_AUTO_RELATE: Required<AutoRelateConfig> = {
  enabled: true,
  minSharedTags: 2,
  minWeight: 0.2,
  maxCandidates: 12,
  sameKind: true,
  samePolarity: true,
  allowedKinds: ["semantic", "procedural"],
};

const AUTO_RELATE_MIN_SHARED_TAGS = 1;
const AUTO_RELATE_MIN_MAX_CANDIDATES = 1;

function toBetaEdge(raw: any): { a: number; b: number; strength: number; evidence: number; updatedAt: string | null } {
  const aMin = 1e-3;
  const bMin = 1e-3;
  const strength = typeof raw?.strength === "number" ? raw.strength : 0.5;
  const a = typeof raw?.a === "number" ? raw.a : Math.max(aMin, strength * 2.0);
  const b = typeof raw?.b === "number" ? raw.b : Math.max(bMin, (1.0 - strength) * 2.0);
  const ev = typeof raw?.evidence === "number" ? raw.evidence : (a + b);
  return {
    a,
    b,
    strength: typeof raw?.strength === "number" ? raw.strength : (a / (a + b)),
    evidence: ev,
    updatedAt: raw?.updatedAt ?? null,
  };
}

function toMemoryRecord(raw: any): MemoryRecord {
  return {
    id: raw.id,
    kind: raw.kind,
    polarity: raw.polarity ?? "positive",
    title: raw.title,
    content: raw.content,
    tags: raw.tags ?? [],
    confidence: raw.confidence ?? 0.7,
    utility: raw.utility ?? 0.2,
    createdAt: toDateString(raw.createdAt),
    updatedAt: toDateString(raw.updatedAt),
    triage: parseJsonField(raw.triage),
    antiPattern: parseJsonField(raw.antiPattern),
    env: raw.env ?? undefined,
  };
}

function defaultPolicy(req?: SaveLearningRequest["policy"]) {
  return {
    minConfidence: req?.minConfidence ?? 0.65,
    requireVerificationSteps: req?.requireVerificationSteps ?? true,
    maxItems: req?.maxItems ?? 5,
  };
}

function detectSecrets(text: string): boolean {
  const suspicious =
    /(AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----|xox[baprs]-|ghp_[A-Za-z0-9]{36,})/;
  return suspicious.test(text);
}

function validateLearning(l: LearningCandidate, pol: ReturnType<typeof defaultPolicy>): string | null {
  if (!l.title || l.title.trim().length < 4) return "title too short";
  if (!l.content || l.content.trim().length < 20) return "content too short";
  if ((l.tags ?? []).length < 1) return "missing tags";
  if (!(l.confidence >= 0 && l.confidence <= 1)) return "confidence must be 0..1";
  if (l.confidence < pol.minConfidence) return `confidence < ${pol.minConfidence}`;
  if (detectSecrets(l.content)) return "possible secret detected";
  if (l.kind === "procedural" && pol.requireVerificationSteps) {
    const v = l.triage?.verificationSteps?.length ?? 0;
    const f = l.triage?.fixSteps?.length ?? 0;
    if (v < 1) return "procedural requires triage.verificationSteps";
    if (f < 1) return "procedural requires triage.fixSteps";
  }
  const polarity = l.polarity ?? "positive";
  if (polarity === "negative") {
    if (!l.antiPattern?.action || !l.antiPattern?.whyBad) {
      return "negative memories require antiPattern.action + antiPattern.whyBad";
    }
  }
  return null;
}

function formatEpisodeContent(args: CaptureEpisodeArgs, title: string): string {
  const lines = [
    `Title: ${title}`,
    `Run: ${args.runId}`,
    `Workflow: ${args.workflowName}`,
    `Outcome: ${args.outcome ?? "unknown"}`,
    "",
    "Prompt:",
    args.prompt.trim(),
    "",
    "Response:",
    args.response.trim(),
  ];
  return lines.join("\n");
}

function buildEpisodeLearning(args: CaptureEpisodeArgs, title: string): LearningCandidate {
  return {
    kind: "episodic",
    title,
    content: formatEpisodeContent(args, title),
    tags: args.tags ?? [],
    confidence: 0.7,
  };
}

export class MemoryService {
  private client: Neo4jClient;
  private vectorIndex: string;
  private fulltextIndex: string;
  private halfLifeSeconds: number;
  private onMemoryEvent?: MemoryServiceConfig["onMemoryEvent"];
  private autoRelateConfig: Required<AutoRelateConfig>;

  private cyUpsertMemory = cypher.upsertMemory;
  private cyUpsertCase = cypher.upsertCase;
  private cyRetrieveBundle = cypher.retrieveContextBundle;
  private cyFeedbackBatch = cypher.feedbackBatch;
  private cyFeedbackCoUsed = cypher.feedbackCoUsed;
  private cyListMemories = cypher.listMemories;
  private cyRelateConcepts = cypher.relateConcepts;
  private cyAutoRelateByTags = cypher.autoRelateByTags;
  private cyGetMemoriesById = cypher.getMemoriesById;
  private cyGetMemoryGraph = cypher.getMemoryGraph;
  private cyGetRecallEdges = `
    UNWIND $ids AS id
    MATCH (m:Memory {id:id})
    OPTIONAL MATCH (a:Agent {id:$agentId})-[r:RECALLS]->(m)
    RETURN id AS id,
           r.a AS a,
           r.b AS b,
           r.strength AS strength,
           r.evidence AS evidence,
           toString(r.updatedAt) AS updatedAt
  `;

  constructor(cfg: MemoryServiceConfig) {
    this.client = new Neo4jClient(cfg.neo4j);
    this.vectorIndex = cfg.vectorIndex ?? "memoryEmbedding";
    this.fulltextIndex = cfg.fulltextIndex ?? "memoryText";
    this.halfLifeSeconds = cfg.halfLifeSeconds ?? 30 * 24 * 3600;
    this.onMemoryEvent = cfg.onMemoryEvent;
    const autoRelate = cfg.autoRelate ?? {};
    this.autoRelateConfig = {
      enabled: autoRelate.enabled ?? DEFAULT_AUTO_RELATE.enabled,
      minSharedTags: Math.max(
        AUTO_RELATE_MIN_SHARED_TAGS,
        Math.floor(autoRelate.minSharedTags ?? DEFAULT_AUTO_RELATE.minSharedTags)
      ),
      minWeight: clamp01(autoRelate.minWeight ?? DEFAULT_AUTO_RELATE.minWeight),
      maxCandidates: Math.max(
        AUTO_RELATE_MIN_MAX_CANDIDATES,
        Math.floor(autoRelate.maxCandidates ?? DEFAULT_AUTO_RELATE.maxCandidates)
      ),
      sameKind: autoRelate.sameKind ?? DEFAULT_AUTO_RELATE.sameKind,
      samePolarity: autoRelate.samePolarity ?? DEFAULT_AUTO_RELATE.samePolarity,
      allowedKinds: autoRelate.allowedKinds ?? [...DEFAULT_AUTO_RELATE.allowedKinds],
    };
  }

  async init(): Promise<void> {
    await ensureSchema(this.client);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  private ensureEnvHash(env?: EnvironmentFingerprint): EnvironmentFingerprint {
    const e = env ?? {};
    if (!e.hash) e.hash = envHash(e);
    return e;
  }

  private emit(event: Omit<MemoryEvent, "at">): void {
    if (!this.onMemoryEvent) return;
    try {
      this.onMemoryEvent({ ...event, at: new Date().toISOString() });
    } catch {
      // never allow callbacks to break core flows
    }
  }

  /**
   * Save a distilled memory (semantic/procedural/episodic) with exact dedupe by contentHash.
   * NOTE: This package intentionally does not store "full answers" as semantic/procedural.
   */
  async upsertMemory(l: LearningCandidate & { id?: string }): Promise<{ id: string; deduped: boolean }> {
    const id = l.id ?? newId("mem");
    const polarity: MemoryPolarity = l.polarity ?? "positive";
    const tags = [...new Set((l.tags ?? []).map((t) => t.trim()).filter(Boolean))];

    const canonical = canonicaliseForHash(l.title, l.content, tags);
    const contentHash = sha256Hex(canonical);

    // Exact dedupe by contentHash
    const read = this.client.session("READ");
    try {
      const existing = await read.run(
        "MATCH (m:Memory {contentHash: $h}) RETURN m.id AS id LIMIT 1",
        { h: contentHash }
      );
      if (existing.records.length > 0) {
        const existingId = existing.records[0].get("id");
        this.emit({ type: "write", action: "upsertMemory.dedupe", meta: { id: existingId } });
        return { id: existingId, deduped: true };
      }
    } finally {
      await read.close();
    }

    const write = this.client.session("WRITE");
    try {
      await write.run(this.cyUpsertMemory, {
        id,
        kind: l.kind,
        polarity,
        title: l.title,
        content: l.content,
        contentHash,
        tags,
        confidence: clamp01(l.confidence),
        utility: 0.2, // start modest; reinforce via feedback
        triage: l.triage ? JSON.stringify(l.triage) : null,
        antiPattern: l.antiPattern ? JSON.stringify(l.antiPattern) : null,
      });
      // Attach env applicability (optional) as a fingerprint node
      if (l.env) {
        const env = this.ensureEnvHash(l.env);
        await write.run(
          `MERGE (e:EnvironmentFingerprint {hash:$hash})
           ON CREATE SET e.os=$os, e.distro=$distro, e.ci=$ci, e.container=$container,
                         e.filesystem=$filesystem, e.workspaceMount=$workspaceMount,
                         e.nodeVersion=$nodeVersion, e.packageManager=$packageManager, e.pmVersion=$pmVersion
           WITH e
           MATCH (m:Memory {id:$id})
           MERGE (m)-[:APPLIES_IN]->(e)`,
          {
            id,
            hash: env.hash,
            os: env.os ?? null,
            distro: env.distro ?? null,
            ci: env.ci ?? null,
            container: env.container ?? null,
            filesystem: env.filesystem ?? null,
            workspaceMount: env.workspaceMount ?? null,
            nodeVersion: env.nodeVersion ?? null,
            packageManager: env.packageManager ?? null,
            pmVersion: env.pmVersion ?? null,
          }
        );
      }
      const autoRelate = this.autoRelateConfig;
      const allowedKinds = autoRelate.allowedKinds ?? [];
      const canAutoRelate =
        autoRelate.enabled &&
        tags.length >= autoRelate.minSharedTags &&
        (allowedKinds.length === 0 || allowedKinds.includes(l.kind));
      if (canAutoRelate) {
        await write.run(this.cyAutoRelateByTags, {
          id,
          nowIso: new Date().toISOString(),
          minSharedTags: autoRelate.minSharedTags,
          minWeight: autoRelate.minWeight,
          maxCandidates: autoRelate.maxCandidates,
          sameKind: autoRelate.sameKind,
          samePolarity: autoRelate.samePolarity,
          allowedKinds,
        });
      }
      this.emit({ type: "write", action: "upsertMemory", meta: { id } });
      return { id, deduped: false };
    } finally {
      await write.close();
    }
  }

  /**
   * Upsert an episodic Case (case-based reasoning) that links symptoms + env + resolved_by + negative memories.
   */
  async upsertCase(c: CaseRecord): Promise<string> {
    const env = this.ensureEnvHash(c.env);
    const symptoms = [...new Set((c.symptoms ?? []).map(normaliseSymptom).filter(Boolean))];

    const session = this.client.session("WRITE");
    try {
      const res = await session.run(this.cyUpsertCase, {
        caseId: c.id,
        title: c.title,
        summary: c.summary,
        outcome: c.outcome,
        symptoms,
        env,
        resolvedByMemoryIds: c.resolvedByMemoryIds ?? [],
        negativeMemoryIds: c.negativeMemoryIds ?? [],
        resolvedAtIso: c.resolvedAtIso ?? null,
      });
      const caseId = res.records[0].get("caseId");
      this.emit({ type: "write", action: "upsertCase", meta: { caseId } });
      return caseId;
    } finally {
      await session.close();
    }
  }

  /**
   * Retrieve a ContextBundle with separate Fix and Do-not-do sections, using case-based reasoning.
   * The key idea: match cases by symptoms + env similarity, then pull linked memories.
   */
  async retrieveContextBundle(args: RetrieveContextArgs): Promise<ContextBundle> {
    const nowIso = args.nowIso ?? new Date().toISOString();
    const symptoms = [...new Set((args.symptoms ?? []).map(normaliseSymptom).filter(Boolean))];
    const env = this.ensureEnvHash(args.env ?? {});
    const caseLimit = args.caseLimit ?? 5;
    const fixLimit = args.fixLimit ?? 8;
    const dontLimit = args.dontLimit ?? 6;

    const session = this.client.session("READ");
    try {
      const r = await session.run(this.cyRetrieveBundle, {
        agentId: args.agentId,
        symptoms,
        tags: args.tags ?? [],
        env,
        caseLimit,
        fixLimit,
        dontLimit,
        nowIso,
        halfLifeSeconds: this.halfLifeSeconds,
      });

      const sections = r.records[0].get("sections") as { fixes: any[]; doNot: any[] };
      const fixes = (sections.fixes ?? []).map((m: any) => ({
        id: m.id,
        kind: m.kind,
        polarity: m.polarity ?? "positive",
        title: m.title,
        content: m.content,
        tags: m.tags ?? [],
        confidence: m.confidence ?? 0.7,
        utility: m.utility ?? 0.2,
        updatedAt: m.updatedAt?.toString?.() ?? null,
      }));
      const doNot = (sections.doNot ?? []).map((m: any) => ({
        id: m.id,
        kind: m.kind,
        polarity: m.polarity ?? "negative",
        title: m.title,
        content: m.content,
        tags: m.tags ?? [],
        confidence: m.confidence ?? 0.7,
        utility: m.utility ?? 0.2,
        updatedAt: m.updatedAt?.toString?.() ?? null,
      }));

      // Fetch current RECALLS edge posteriors for all retrieved memories (edgeAfter).
      const allIds = [...new Set([...fixes.map((x) => x.id), ...doNot.map((x) => x.id)])];
      const edgeAfter = new Map<string, any>();
      if (allIds.length > 0) {
        const edgeRes = await session.run(this.cyGetRecallEdges, { agentId: args.agentId, ids: allIds });
        for (const rec of edgeRes.records) {
          const id = rec.get("id") as string;
          edgeAfter.set(id, {
            a: rec.get("a"),
            b: rec.get("b"),
            strength: rec.get("strength"),
            evidence: rec.get("evidence"),
            updatedAt: rec.get("updatedAt"),
          });
        }
      }

      // Edge before and after: use current RECALLS edges for both (no baseline tracking).
      const fixesWithEdges = fixes.map((m) => ({
        ...m,
        edgeBefore: toBetaEdge(edgeAfter.get(m.id)),
        edgeAfter: undefined,
      }));

      const doNotWithEdges = doNot.map((m) => ({
        ...m,
        edgeBefore: toBetaEdge(edgeAfter.get(m.id)),
        edgeAfter: undefined,
      }));

      const sessionId = newId("session");
      const fixBlock =
        "## Recommended fixes\n" +
        fixesWithEdges
          .map((m) => `\n\n### [MEM:${m.id}] ${m.title}\n${m.content}`)
          .join("");
      const doNotDoBlock =
        "## Do not do\n" +
        doNotWithEdges
          .map((m) => `\n\n### [MEM:${m.id}] ${m.title}\n${m.content}`)
          .join("");

      this.emit({
        type: "read",
        action: "retrieveContextBundle",
        meta: { sessionId, fixCount: fixesWithEdges.length, doNotCount: doNotWithEdges.length },
      });

      return {
        sessionId,
        sections: { fix: fixesWithEdges, doNotDo: doNotWithEdges },
        injection: { fixBlock, doNotDoBlock },
      };
    } finally {
      await session.close();
    }
  }

  async listMemories(args: ListMemoriesArgs = {}): Promise<MemorySummary[]> {
    const session = this.client.session("READ");
    try {
      const res = await session.run(this.cyListMemories, {
        kind: args.kind ?? null,
        limit: args.limit ?? 25,
        agentId: args.agentId ?? null,
      });
      const memories = (res.records[0]?.get("memories") as any[]) ?? [];
      const summaries = memories.map((m) => ({
        id: m.id,
        kind: m.kind,
        polarity: m.polarity ?? "positive",
        title: m.title,
        tags: m.tags ?? [],
        confidence: m.confidence ?? 0.7,
        utility: m.utility ?? 0.2,
        createdAt: m.createdAt?.toString?.() ?? null,
        updatedAt: m.updatedAt?.toString?.() ?? null,
      }));
      this.emit({ type: "read", action: "listMemories", meta: { count: summaries.length, kind: args.kind } });
      return summaries;
    } finally {
      await session.close();
    }
  }

  async getMemoriesById(args: GetMemoriesByIdArgs): Promise<MemoryRecord[]> {
    const ids = [...new Set((args.ids ?? []).filter(Boolean))];
    if (ids.length === 0) return [];
    const session = this.client.session("READ");
    try {
      const res = await session.run(this.cyGetMemoriesById, { ids });
      const memories = (res.records[0]?.get("memories") as any[]) ?? [];
      return memories.map(toMemoryRecord);
    } finally {
      await session.close();
    }
  }

  async getMemoryGraph(args: GetMemoryGraphArgs): Promise<MemoryGraphResponse> {
    const ids = [...new Set((args.memoryIds ?? []).filter(Boolean))];
    if (ids.length === 0) return { nodes: [], edges: [] };
    const session = this.client.session("READ");
    try {
      const res = await session.run(this.cyGetMemoryGraph, {
        agentId: args.agentId ?? null,
        memoryIds: ids,
        includeNodes: args.includeNodes ?? true,
      });
      const record = res.records[0];
      const nodesRaw = (record?.get("nodes") as any[]) ?? [];
      const edges = (record?.get("edges") as any[]) ?? [];
      return {
        nodes: nodesRaw.map(toMemoryRecord),
        edges,
      };
    } finally {
      await session.close();
    }
  }

  async listEpisodes(args: Omit<ListMemoriesArgs, "kind"> = {}): Promise<MemorySummary[]> {
    return this.listMemories({ ...args, kind: "episodic" });
  }

  async listSkills(args: Omit<ListMemoriesArgs, "kind"> = {}): Promise<MemorySummary[]> {
    return this.listMemories({ ...args, kind: "procedural" });
  }

  async listConcepts(args: Omit<ListMemoriesArgs, "kind"> = {}): Promise<MemorySummary[]> {
    return this.listMemories({ ...args, kind: "semantic" });
  }

  async relateConcepts(args: { sourceId: string; targetId: string; weight?: number }): Promise<void> {
    const weight = typeof args.weight === "number" ? args.weight : 0.5;
    const session = this.client.session("WRITE");
    try {
      await session.run(this.cyRelateConcepts, { a: args.sourceId, b: args.targetId, weight });
      this.emit({ type: "write", action: "relateConcepts", meta: { sourceId: args.sourceId, targetId: args.targetId } });
    } finally {
      await session.close();
    }
  }

  async captureEpisode(args: CaptureEpisodeArgs): Promise<SaveLearningResult> {
    const title = `Episode ${args.workflowName} (${args.runId})`;
    const learning = buildEpisodeLearning(args, title);
    const result = await this.saveLearnings({
      agentId: args.agentId,
      sessionId: args.runId,
      learnings: [learning],
    });
    this.emit({ type: "write", action: "captureEpisode", meta: { runId: args.runId, title } });
    return result;
  }

  async captureStepEpisode(args: CaptureStepEpisodeArgs): Promise<SaveLearningResult> {
    const title = `Episode ${args.workflowName} - ${args.stepName}`;
    const base: CaptureEpisodeArgs = {
      agentId: args.agentId,
      runId: args.runId,
      workflowName: args.workflowName,
      prompt: args.prompt,
      response: args.response,
      outcome: args.outcome,
      tags: args.tags,
    };
    const learning = buildEpisodeLearning(base, title);
    const result = await this.saveLearnings({
      agentId: args.agentId,
      sessionId: args.runId,
      learnings: [learning],
    });
    this.emit({ type: "write", action: "captureStepEpisode", meta: { runId: args.runId, stepName: args.stepName } });
    return result;
  }

  /**
   * Reinforce/degrade agent->memory association weights using a single batched Cypher query.
   * This supports mid-run retrieval by making feedback cheap and frequent.
   */
  async feedback(fb: MemoryFeedback): Promise<MemoryFeedbackResult> {
    const nowIso = new Date().toISOString();

    const used = new Set(fb.usedIds ?? []);
    const useful = new Set(fb.usefulIds ?? []);
    const notUseful = new Set(fb.notUsefulIds ?? []);
    const prevented = new Set(fb.preventedErrorIds ?? []);

    // normalise sets: if marked useful or prevented, treat as useful
    for (const id of prevented) useful.add(id);
    for (const id of useful) notUseful.delete(id);

    // Ensure used includes all mentioned ids
    for (const id of useful) used.add(id);
    for (const id of notUseful) used.add(id);

    const quality = clamp01(fb.metrics?.quality ?? 0.7);
    const hallucRisk = clamp01(fb.metrics?.hallucinationRisk ?? 0.2);

    // Convert outcomes to a bounded usefulness signal y ∈ [0,1] and evidence weight w ≥ 0.
    // - y captures "how useful" the memory was (quality + hallucination risk)
    // - w captures "how much to trust" the signal (stronger when quality is higher)
    const baseY = clamp01(quality - 0.7 * hallucRisk);
    const w = 0.5 + 1.5 * quality; // in [0.5, 2.0] if quality∈[0,1]

    // Per-memory y: useful/prevented => baseY, notUseful => 0
    const yById = new Map<string, number>();
    for (const id of used) {
      yById.set(id, useful.has(id) ? baseY : 0.0);
    }

    const items = [...used].map((memoryId) => ({
      memoryId,
      y: yById.get(memoryId) ?? 0.0,
      w,
    }));
    if (items.length === 0) return { updated: [] };

    const session = this.client.session("WRITE");
    try {
      // ensure agent node exists
      await session.run("MERGE (a:Agent {id:$id}) RETURN a", { id: fb.agentId });
      const feedbackRes = await session.run(this.cyFeedbackBatch, {
        agentId: fb.agentId,
        nowIso,
        items,
        halfLifeSeconds: this.halfLifeSeconds,
        aMin: 1e-3,
        bMin: 1e-3,
      });
      const updated = feedbackRes.records.map((rec) => {
        const raw = {
          a: rec.get("a"),
          b: rec.get("b"),
          strength: rec.get("strength"),
          evidence: rec.get("evidence"),
          updatedAt: rec.get("updatedAt"),
        };
        return { id: rec.get("id"), edge: toBetaEdge(raw) };
      });

      // Update CO_USED_WITH edges using canonicalised unordered pairs.
      // Conservative pair usefulness: min(y_i, y_j), so a pair is "useful" only if both were.
      const ids = [...used];
      const pairs: Array<{ a: string; b: string; y: number; w: number }> = [];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i] < ids[j] ? ids[i] : ids[j];
          const b = ids[i] < ids[j] ? ids[j] : ids[i];
          const yA = yById.get(a) ?? 0.0;
          const yB = yById.get(b) ?? 0.0;
          pairs.push({ a, b, y: Math.min(yA, yB), w });
        }
      }

      if (pairs.length > 0) {
        await session.run(this.cyFeedbackCoUsed, {
          nowIso,
          pairs,
          halfLifeSeconds: this.halfLifeSeconds,
          aMin: 1e-3,
          bMin: 1e-3,
        });
      }
      this.emit({ type: "write", action: "feedback", meta: { agentId: fb.agentId, usedCount: used.size } });
      return { updated };
    } finally {
      await session.close();
    }
  }

  /**
   * Save distilled learnings discovered during a task.
   * Enforces quality gates and stores negative memories explicitly.
   * Automatically creates a Case if learnings have triage.symptoms.
   */
  async saveLearnings(req: SaveLearningRequest): Promise<SaveLearningResult> {
    const pol = defaultPolicy(req.policy);
    const limited = (req.learnings ?? []).slice(0, pol.maxItems);

    const saved: SaveLearningResult["saved"] = [];
    const rejected: SaveLearningResult["rejected"] = [];

    // Collect memory IDs by polarity for case creation
    const positiveMemoryIds: string[] = [];
    const negativeMemoryIds: string[] = [];
    let firstEnv: EnvironmentFingerprint | undefined;
    let allSymptoms: string[] = [];

    for (const l of limited) {
      const reason = validateLearning(l, pol);
      if (reason) {
        rejected.push({ title: l.title, reason });
        continue;
      }
      const res = await this.upsertMemory(l);
      saved.push({ id: res.id, kind: l.kind, title: l.title, deduped: res.deduped });

      // Track for case creation
      const polarity = l.polarity ?? "positive";
      if (polarity === "positive") {
        positiveMemoryIds.push(res.id);
      } else {
        negativeMemoryIds.push(res.id);
      }

      // Collect symptoms and env from triage
      if (l.triage?.symptoms) {
        allSymptoms.push(...l.triage.symptoms);
      }
      if (l.env && !firstEnv) {
        firstEnv = l.env;
      }
    }

    // Auto-create a Case if we have symptoms and saved memories
    if (allSymptoms.length > 0 && (positiveMemoryIds.length > 0 || negativeMemoryIds.length > 0)) {
      const uniqueSymptoms = [...new Set(allSymptoms)];
      const caseId = req.sessionId ? `case_${req.sessionId}` : newId("case");

      await this.upsertCase({
        id: caseId,
        title: req.learnings[0]?.title ?? "Auto-generated case",
        summary: `Case auto-created from ${saved.length} learnings`,
        outcome: "resolved",
        symptoms: uniqueSymptoms,
        env: firstEnv ?? {},
        resolvedByMemoryIds: positiveMemoryIds,
        negativeMemoryIds: negativeMemoryIds,
        resolvedAtIso: new Date().toISOString(),
      });

      console.log(`✅ Auto-created Case ${caseId} linking ${positiveMemoryIds.length} positive and ${negativeMemoryIds.length} negative memories to symptoms: [${uniqueSymptoms.join(', ')}]`);
    }

    this.emit({
      type: "write",
      action: "saveLearnings",
      meta: { savedCount: saved.length, rejectedCount: rejected.length },
    });
    return { saved, rejected };
  }
}

export async function createMemoryService(cfg: MemoryServiceConfig): Promise<MemoryService> {
  const svc = new MemoryService(cfg);
  await svc.init();
  return svc;
}
