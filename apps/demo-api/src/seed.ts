import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeContentHashForCard, cypher, envHash, sha256Hex } from "@neuralsea/neo4j-agent-memory";
import { exitWithError } from "./utils/errors.js";
import { parseBoolean, parseCsvFile, parseNumber, parsePipeList } from "./utils/csv.js";
import { envBool, envInt } from "./utils/env.js";
import { createNeo4jClientFromEnv } from "./utils/neo4j.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const seedDir = path.resolve(here, "..", "seed");

const DEFAULT_SCHEMA_USES = 20;
const DEFAULT_CYPHER_USES = 20;
const DEFAULT_BATCH_HALF_LIFE_SECONDS = 30 * 24 * 3600;
const DEFAULT_A_MIN = 1e-3;
const DEFAULT_B_MIN = 1e-3;

type ScriptName = keyof typeof cypher;

function parseOptionalJsonString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalPipeList(value: string): string[] | null {
  const list = parsePipeList(value);
  return list.length > 0 ? list : null;
}

function parseScopeRow(row: Record<string, string>): {
  scopeRepo: string | null;
  scopePackage: string | null;
  scopeModule: string | null;
  scopeRuntime: string | null;
  scopeVersions: string[] | null;
} {
  return {
    scopeRepo: row.scopeRepo?.trim?.() ? row.scopeRepo.trim() : null,
    scopePackage: row.scopePackage?.trim?.() ? row.scopePackage.trim() : null,
    scopeModule: row.scopeModule?.trim?.() ? row.scopeModule.trim() : null,
    scopeRuntime: row.scopeRuntime?.trim?.() ? row.scopeRuntime.trim() : null,
    scopeVersions: parseOptionalPipeList(row.scopeVersions ?? ""),
  };
}

async function applySchema(client: ReturnType<typeof createNeo4jClientFromEnv>): Promise<void> {
  const session = client.session("WRITE");
  try {
    const statements = cypher.schema
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) await session.run(stmt);
  } finally {
    await session.close();
  }
}

async function clearDatabase(client: ReturnType<typeof createNeo4jClientFromEnv>): Promise<void> {
  const session = client.session("WRITE");
  try {
    await session.run("MATCH (n) DETACH DELETE n");
  } finally {
    await session.close();
  }
}

async function detectApoc(client: ReturnType<typeof createNeo4jClientFromEnv>): Promise<boolean> {
  const session = client.session("READ");
  try {
    await session.run("RETURN apoc.version() AS v");
    return true;
  } catch {
    return false;
  } finally {
    await session.close();
  }
}

function idsForTest(memoryIds: string[], i: number): string[] {
  if (memoryIds.length === 0) return [];
  const a = memoryIds[i % memoryIds.length];
  const b = memoryIds[(i + 1) % memoryIds.length];
  const c = memoryIds[(i + 2) % memoryIds.length];
  return [...new Set([a, b, c])];
}

async function main() {
  const minCypherUses = envInt("SEED_MIN_CYPHER_USES", DEFAULT_CYPHER_USES);
  const minSchemaUses = envInt("SEED_MIN_SCHEMA_USES", DEFAULT_SCHEMA_USES);
  const shouldClear = envBool("SEED_CLEAR", false);

  const client = createNeo4jClientFromEnv();
  const apocAvailable = await detectApoc(client);
  const scriptUses = new Map<ScriptName, number>(
    Object.keys(cypher)
      .filter((k) => (apocAvailable ? true : k !== "getKnowledgeGraphByTagsApoc"))
      .map((k) => [k as ScriptName, 0])
  );

  async function runScript(
    mode: "READ" | "WRITE",
    name: ScriptName,
    query: string,
    params: Record<string, unknown>
  ) {
    const session = client.session(mode);
    try {
      const res = await session.run(query, params);
      scriptUses.set(name, (scriptUses.get(name) ?? 0) + 1);
      return res;
    } finally {
      await session.close();
    }
  }

  if (shouldClear) {
    console.log("Clearing database...");
    await clearDatabase(client);
  }

  console.log(`Applying schema ${minSchemaUses}x...`);
  for (let i = 0; i < minSchemaUses; i++) {
    await applySchema(client);
    scriptUses.set("schema", (scriptUses.get("schema") ?? 0) + 1);
  }

  const agents = await parseCsvFile(path.resolve(seedDir, "agents.csv"));
  const agentIds = agents.map((r) => r.id).filter(Boolean);
  console.log(`Creating agents: ${agentIds.join(", ")}`);
  {
    const session = client.session("WRITE");
    try {
      await session.run("UNWIND $ids AS id MERGE (:Agent {id:id})", { ids: agentIds });
    } finally {
      await session.close();
    }
  }

  const memories = await parseCsvFile(path.resolve(seedDir, "memories.csv"));
  console.log(`Upserting ${memories.length} memories...`);
  for (const m of memories) {
    const tags = parsePipeList(m.tags);
    const whenToUse = parseOptionalPipeList(m.whenToUse ?? "");
    const howToApply = parseOptionalPipeList(m.howToApply ?? "");
    const gotchas = parseOptionalPipeList(m.gotchas ?? "");
    const evidence = parseOptionalPipeList(m.evidence ?? "");
    const scope = parseScopeRow(m);
    const contentHash = m.contentHash?.trim()
      ? m.contentHash.trim()
      : computeContentHashForCard({
          kind: m.kind,
          title: m.title,
          summary: m.summary ?? "",
          whenToUse: whenToUse ?? [],
          howToApply: howToApply ?? [],
          gotchas: gotchas ?? [],
          evidence: evidence ?? [],
          scope: {
            repo: scope.scopeRepo ?? undefined,
            package: scope.scopePackage ?? undefined,
            module: scope.scopeModule ?? undefined,
            runtime: scope.scopeRuntime ?? undefined,
            versions: scope.scopeVersions ?? undefined,
          },
        });
    const errorSigs = parsePipeList(m.errorSignatures ?? "");
    const errorSignatures =
      errorSigs.length > 0
        ? errorSigs.map((text) => ({ id: `err:${sha256Hex(String(text))}`, text }))
        : null;
    await runScript("WRITE", "upsertMemory", cypher.upsertMemory, {
      agentId: m.agentId?.trim?.() ? m.agentId.trim() : null,
      taskId: m.taskId?.trim?.() ? m.taskId.trim() : null,
      id: m.id,
      kind: m.kind,
      polarity: m.polarity,
      title: m.title,
      content: m.content,
      summary: m.summary?.trim?.() ? m.summary.trim() : null,
      whenToUse,
      howToApply,
      gotchas,
      scopeRepo: scope.scopeRepo,
      scopePackage: scope.scopePackage,
      scopeModule: scope.scopeModule,
      scopeRuntime: scope.scopeRuntime,
      scopeVersions: scope.scopeVersions,
      evidence,
      outcome: m.outcome?.trim?.() ? m.outcome.trim() : null,
      validFromIso: m.validFromIso?.trim?.() ? m.validFromIso.trim() : null,
      validToIso: m.validToIso?.trim?.() ? m.validToIso.trim() : null,
      contentHash,
      tags,
      confidence: parseNumber(m.confidence, 0.7),
      utility: parseNumber(m.utility, 0.2),
      triage: parseOptionalJsonString(m.triage_json),
      signals: parseOptionalJsonString(m.signals_json ?? ""),
      distilled: parseOptionalJsonString(m.distilled_json ?? ""),
      antiPattern: parseOptionalJsonString(m.antipattern_json),
      concepts: parsePipeList(m.concepts ?? ""),
      symptoms: parsePipeList(m.symptoms ?? ""),
      filePaths: parsePipeList(m.filePaths ?? ""),
      toolNames: parsePipeList(m.toolNames ?? ""),
      errorSignatures,
    });
  }

  const memoryIds = memories.map((m) => m.id).filter(Boolean);

  const cases = await parseCsvFile(path.resolve(seedDir, "cases.csv"));
  console.log(`Upserting ${cases.length} cases...`);
  for (const c of cases) {
    const env = {
      os: c.env_os || undefined,
      ci: parseBoolean(c.env_ci, false),
      container: parseBoolean(c.env_container, false),
      packageManager: c.env_packageManager || undefined,
      nodeVersion: c.env_nodeVersion || undefined,
    };
    const envWithHash = { ...env, hash: envHash(env as any) };
    await runScript("WRITE", "upsertCase", cypher.upsertCase, {
      caseId: c.id,
      title: c.title,
      summary: c.summary,
      outcome: c.outcome,
      symptoms: parsePipeList(c.symptoms),
      env: envWithHash,
      resolvedByMemoryIds: parsePipeList(c.resolvedByMemoryIds),
      negativeMemoryIds: parsePipeList(c.negativeMemoryIds),
      resolvedAtIso: c.resolvedAtIso || null,
    });
  }

  const relations = await parseCsvFile(path.resolve(seedDir, "concept_relations.csv"));
  console.log(`Creating ${relations.length} concept relations...`);
  for (const rel of relations) {
    await runScript("WRITE", "relateConcepts", cypher.relateConcepts, {
      a: rel.a,
      b: rel.b,
      weight: parseNumber(rel.weight, 0.5),
    });
  }

  const recalls = await parseCsvFile(path.resolve(seedDir, "recalls.csv"));
  console.log(`Seeding recall edges with ${recalls.length} feedback rows...`);
  const nowIso = new Date().toISOString();
  for (const row of recalls) {
    await runScript("WRITE", "feedbackBatch", cypher.feedbackBatch, {
      nowIso,
      agentId: row.agentId,
      halfLifeSeconds: DEFAULT_BATCH_HALF_LIFE_SECONDS,
      aMin: DEFAULT_A_MIN,
      bMin: DEFAULT_B_MIN,
      items: [
        {
          memoryId: row.memoryId,
          y: parseNumber(row.y, 0.5),
          w: parseNumber(row.w, 1.0),
        },
      ],
    });
  }

  const pairs = await parseCsvFile(path.resolve(seedDir, "co_used_pairs.csv"));
  console.log(`Seeding co-used edges with ${pairs.length} pair rows...`);
  for (const p of pairs) {
    await runScript("WRITE", "feedbackCoUsed", cypher.feedbackCoUsed, {
      nowIso,
      halfLifeSeconds: DEFAULT_BATCH_HALF_LIFE_SECONDS,
      aMin: DEFAULT_A_MIN,
      bMin: DEFAULT_B_MIN,
      pairs: [
        {
          a: p.a,
          b: p.b,
          y: parseNumber(p.y, 0.5),
          w: parseNumber(p.w, 1.0),
        },
      ],
    });
  }

  // Exercise read-heavy scripts and any scripts that didn't hit the minimum yet.
  console.log(`Exercising cypher scripts to reach ${minCypherUses} uses each...`);
  for (const [name, count] of scriptUses) {
    if (count >= minCypherUses) continue;
    const remaining = minCypherUses - count;
    console.log(`- ${name}: +${remaining} runs`);

    for (let i = 0; i < remaining; i++) {
      if (name === "schema") {
        await applySchema(client);
        scriptUses.set("schema", (scriptUses.get("schema") ?? 0) + 1);
        continue;
      }
      if (name === "upsertMemory") {
        const m = memories[i % memories.length];
        const tags = parsePipeList(m.tags);
        const whenToUse = parseOptionalPipeList(m.whenToUse ?? "");
        const howToApply = parseOptionalPipeList(m.howToApply ?? "");
        const gotchas = parseOptionalPipeList(m.gotchas ?? "");
        const evidence = parseOptionalPipeList(m.evidence ?? "");
        const scope = parseScopeRow(m);
        const contentHash = m.contentHash?.trim()
          ? m.contentHash.trim()
          : computeContentHashForCard({
              kind: m.kind,
              title: m.title,
              summary: m.summary ?? "",
              whenToUse: whenToUse ?? [],
              howToApply: howToApply ?? [],
              gotchas: gotchas ?? [],
              evidence: evidence ?? [],
              scope: {
                repo: scope.scopeRepo ?? undefined,
                package: scope.scopePackage ?? undefined,
                module: scope.scopeModule ?? undefined,
                runtime: scope.scopeRuntime ?? undefined,
                versions: scope.scopeVersions ?? undefined,
              },
            });
        const errorSigs = parsePipeList(m.errorSignatures ?? "");
        const errorSignatures =
          errorSigs.length > 0
            ? errorSigs.map((text) => ({ id: `err:${sha256Hex(String(text))}`, text }))
            : null;
        await runScript("WRITE", "upsertMemory", cypher.upsertMemory, {
          agentId: m.agentId?.trim?.() ? m.agentId.trim() : null,
          taskId: m.taskId?.trim?.() ? m.taskId.trim() : null,
          id: m.id,
          kind: m.kind,
          polarity: m.polarity,
          title: m.title,
          content: m.content,
          summary: m.summary?.trim?.() ? m.summary.trim() : null,
          whenToUse,
          howToApply,
          gotchas,
          scopeRepo: scope.scopeRepo,
          scopePackage: scope.scopePackage,
          scopeModule: scope.scopeModule,
          scopeRuntime: scope.scopeRuntime,
          scopeVersions: scope.scopeVersions,
          evidence,
          outcome: m.outcome?.trim?.() ? m.outcome.trim() : null,
          validFromIso: m.validFromIso?.trim?.() ? m.validFromIso.trim() : null,
          validToIso: m.validToIso?.trim?.() ? m.validToIso.trim() : null,
          contentHash,
          tags,
          confidence: parseNumber(m.confidence, 0.7),
          utility: parseNumber(m.utility, 0.2),
          triage: parseOptionalJsonString(m.triage_json),
          signals: parseOptionalJsonString(m.signals_json ?? ""),
          distilled: parseOptionalJsonString(m.distilled_json ?? ""),
          antiPattern: parseOptionalJsonString(m.antipattern_json),
          concepts: parsePipeList(m.concepts ?? ""),
          symptoms: parsePipeList(m.symptoms ?? ""),
          filePaths: parsePipeList(m.filePaths ?? ""),
          toolNames: parsePipeList(m.toolNames ?? ""),
          errorSignatures,
        });
        continue;
      }
      if (name === "upsertCase") {
        const c = cases[i % cases.length];
        const env = {
          os: c.env_os || undefined,
          ci: parseBoolean(c.env_ci, false),
          container: parseBoolean(c.env_container, false),
          packageManager: c.env_packageManager || undefined,
          nodeVersion: c.env_nodeVersion || undefined,
        };
        const envWithHash = { ...env, hash: envHash(env as any) };
        await runScript("WRITE", "upsertCase", cypher.upsertCase, {
          caseId: c.id,
          title: c.title,
          summary: c.summary,
          outcome: c.outcome,
          symptoms: parsePipeList(c.symptoms),
          env: envWithHash,
          resolvedByMemoryIds: parsePipeList(c.resolvedByMemoryIds),
          negativeMemoryIds: parsePipeList(c.negativeMemoryIds),
          resolvedAtIso: c.resolvedAtIso || null,
        });
        continue;
      }
      if (name === "listMemories") {
        await runScript("READ", "listMemories", cypher.listMemories, { kind: null, limit: 10, agentId: "" });
        continue;
      }
      if (name === "relateConcepts") {
        const ids = idsForTest(memoryIds, i);
        if (ids.length < 2) continue;
        await runScript("WRITE", "relateConcepts", cypher.relateConcepts, { a: ids[0], b: ids[1], weight: 0.5 });
        continue;
      }
      if (name === "feedbackBatch") {
        const id = memoryIds[i % memoryIds.length];
        await runScript("WRITE", "feedbackBatch", cypher.feedbackBatch, {
          nowIso,
          agentId: "Seed",
          halfLifeSeconds: DEFAULT_BATCH_HALF_LIFE_SECONDS,
          aMin: DEFAULT_A_MIN,
          bMin: DEFAULT_B_MIN,
          items: [{ memoryId: id, y: 0.7, w: 1.0 }],
        });
        continue;
      }
      if (name === "feedbackCoUsed") {
        const ids = idsForTest(memoryIds, i);
        if (ids.length < 2) continue;
        await runScript("WRITE", "feedbackCoUsed", cypher.feedbackCoUsed, {
          nowIso,
          halfLifeSeconds: DEFAULT_BATCH_HALF_LIFE_SECONDS,
          aMin: DEFAULT_A_MIN,
          bMin: DEFAULT_B_MIN,
          pairs: [{ a: ids[0], b: ids[1], y: 0.7, w: 1.0 }],
        });
        continue;
      }
      if (name === "getMemoriesById") {
        await runScript("READ", "getMemoriesById", cypher.getMemoriesById, { ids: idsForTest(memoryIds, i) });
        continue;
      }
      if (name === "getMemoryGraph") {
        await runScript("READ", "getMemoryGraph", cypher.getMemoryGraph, {
          agentId: "Seed",
          memoryIds: idsForTest(memoryIds, i),
          includeNodes: true,
          includeRelatedTo: true,
        });
        continue;
      }
      if (name === "getKnowledgeGraphByTags") {
        await runScript("READ", "getKnowledgeGraphByTags", cypher.getKnowledgeGraphByTags, {
          tags: ["npm", "permissions"],
          limit: 50,
          minStrength: 0.0,
          includeNodes: true,
        });
        continue;
      }
      if (name === "getKnowledgeGraphByTagsGraph") {
        await runScript("READ", "getKnowledgeGraphByTagsGraph", cypher.getKnowledgeGraphByTagsGraph, {
          tags: ["npm", "permissions"],
          limit: 50,
          minStrength: 0.0,
        });
        continue;
      }
      if (name === "getKnowledgeGraphByTagsApoc") {
        if (!apocAvailable) continue;
        await runScript("READ", "getKnowledgeGraphByTagsApoc", cypher.getKnowledgeGraphByTagsApoc, {
          tags: ["npm", "permissions"],
          limit: 50,
          minStrength: 0.0,
        });
        continue;
      }
      if (name === "listMemoryEdges") {
        await runScript("READ", "listMemoryEdges", cypher.listMemoryEdges, { limit: 50, minStrength: 0.0 });
        continue;
      }
      if (name === "searchMemories") {
        await runScript("READ", "searchMemories", cypher.searchMemories, {
          query: "permission denied node_modules",
          fulltextIndex: "memoryText",
          tags: ["npm"],
          kind: null,
          outcome: null,
          scopeRepo: null,
          scopePackage: null,
          scopeModule: null,
          scopeRuntime: null,
          scopeVersions: null,
          topK: 20,
        });
        continue;
      }
      if (name === "fallbackRetrieveMemories") {
        await runScript("READ", "fallbackRetrieveMemories", cypher.fallbackRetrieveMemories, {
          prompt: "permission denied",
          tags: ["npm", "permissions"],
          kinds: [],
          fulltextIndex: "memoryText",
          vectorIndex: "memoryEmbedding",
          embedding: null,
          useFulltext: true,
          useVector: false,
          useTags: true,
          fixLimit: 8,
          dontLimit: 6,
        });
        continue;
      }
      if (name === "retrieveContextBundle") {
        await runScript("READ", "retrieveContextBundle", cypher.retrieveContextBundle, {
          nowIso,
          symptoms: ["eacces", "permission denied"],
          tags: ["npm"],
          env: { os: "macos", packageManager: "npm", container: false, ci: false },
          agentId: "Seed",
          caseLimit: 5,
          fixLimit: 8,
          dontLimit: 6,
          halfLifeSeconds: DEFAULT_BATCH_HALF_LIFE_SECONDS,
        });
        continue;
      }
      if (name === "autoRelateByTags") {
        const id = memoryIds[i % memoryIds.length];
        await runScript("WRITE", "autoRelateByTags", cypher.autoRelateByTags, {
          nowIso,
          id,
          minSharedTags: 1,
          minWeight: 0.1,
          maxCandidates: 10,
          sameKind: false,
          samePolarity: false,
          allowedKinds: [],
        });
        continue;
      }
      throw new Error(`No exercise strategy for script ${name}`);
    }
  }

  const belowTarget = [...scriptUses.entries()].filter(([, v]) => v < minCypherUses);
  if (belowTarget.length > 0) {
    throw new Error(`Not all scripts reached ${minCypherUses} uses: ${belowTarget.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }

  console.log("Cypher usage counts:");
  for (const [k, v] of [...scriptUses.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`- ${k}: ${v}`);
  }

  await client.close();
}

main().catch(exitWithError);
