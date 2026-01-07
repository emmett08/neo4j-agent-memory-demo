import { Neo4jClient } from "./neo4j/client.js";
import { ensureSchema } from "./neo4j/schema.js";
import type {
  CaptureEpisodeArgs,
  CaptureStepEpisodeArgs,
  CaptureUsefulLearningArgs,
  CaseRecord,
  ContextBundle,
  ContextBundleWithGraph,
  GetKnowledgeGraphByTagsArgs,
  GetMemoriesByIdArgs,
  GetMemoryGraphArgs,
  KnowledgeGraphResponse,
  ListMemoriesArgs,
  ListMemoryEdgesArgs,
  MemoryEdgeExport,
  MemoryFeedback,
  MemoryFeedbackResult,
  MemoryGraphResponse,
  MemoryRecord,
  MemoryServiceConfig,
  MemorySummary,
  RetrieveContextArgs,
  RetrieveContextBundleWithGraphArgs,
  SaveLearningRequest,
  SaveLearningResult,
  SearchMemoriesArgs,
  SearchMemorySummary,
} from "./types.js";
import { newId, normaliseSymptom } from "./utils/hash.js";
import { buildAutoRelateConfig } from "./domain/auto_relate_config.js";
import { defaultPolicy } from "./domain/learning_policy.js";
import { DefaultSecretScanner } from "./domain/secret_scanner.js";
import { LearningValidator } from "./domain/learning_validator.js";
import { buildEpisodeLearning } from "./domain/episode_builder.js";
import { CallbackEventBus, NullLogger, type EventBus, type Logger } from "./domain/observability.js";
import { ensureEnvHash } from "./domain/environment.js";
import { Neo4jMemoryRepository } from "./infrastructure/neo4j/memory_repository.js";
import { Neo4jCaseRepository } from "./infrastructure/neo4j/case_repository.js";
import { Neo4jFeedbackRepository } from "./infrastructure/neo4j/feedback_repository.js";
import { Neo4jRetrievalRepository } from "./infrastructure/neo4j/retrieval_repository.js";
import { MemoryWriter } from "./application/memory_writer.js";
import { SaveLearningsUseCase } from "./application/save_learnings.js";
import { RetrieveContextBundleUseCase } from "./application/retrieve_context_bundle.js";
import { FeedbackUseCase } from "./application/feedback.js";
import { compileMemoryFromRun, computeContentHashForCard } from "./memory_compiler.js";

/**
 * Facade over the memory use-cases.
 * Keeps backward compatibility with the public API while delegating responsibilities to
 * domain + application + infrastructure layers.
 */
export class MemoryService {
  // Intentionally mutable for unit tests (existing tests monkeypatch this).
  client: any;

  private vectorIndex: string;
  private fulltextIndex: string;
  private halfLifeSeconds: number;

  private eventBus: EventBus;
  private logger: Logger;

  private memoryRepo: Neo4jMemoryRepository;
  private caseRepo: Neo4jCaseRepository;
  private feedbackRepo: Neo4jFeedbackRepository;
  private retrievalRepo: Neo4jRetrievalRepository;

  private validator: LearningValidator;
  private memoryWriter: MemoryWriter;

  private saveLearningsUC: SaveLearningsUseCase;
  private retrieveBundleUC: RetrieveContextBundleUseCase;
  private feedbackUC: FeedbackUseCase;

  constructor(cfg: MemoryServiceConfig) {
    this.client = new Neo4jClient(cfg.neo4j);
    this.vectorIndex = cfg.vectorIndex ?? "memoryEmbedding";
    this.fulltextIndex = cfg.fulltextIndex ?? "memoryText";
    this.halfLifeSeconds = cfg.halfLifeSeconds ?? 30 * 24 * 3600;

    this.logger = cfg.logger ?? new NullLogger();
    this.eventBus = new CallbackEventBus(cfg.onMemoryEvent);

    const autoRelateConfig = buildAutoRelateConfig(cfg.autoRelate);

    const clientProvider = () => this.client as Neo4jClient;
    this.memoryRepo = new Neo4jMemoryRepository(clientProvider);
    this.caseRepo = new Neo4jCaseRepository(clientProvider);
    this.feedbackRepo = new Neo4jFeedbackRepository(clientProvider);
    this.retrievalRepo = new Neo4jRetrievalRepository(clientProvider);

    this.validator = new LearningValidator(defaultPolicy(undefined), new DefaultSecretScanner());
    this.memoryWriter = new MemoryWriter(this.memoryRepo, autoRelateConfig);

    this.saveLearningsUC = new SaveLearningsUseCase(this.validator, this.memoryWriter, this.caseRepo, this.eventBus, this.logger);
    this.retrieveBundleUC = new RetrieveContextBundleUseCase(
      this.retrievalRepo,
      this.eventBus,
      this.fulltextIndex,
      this.vectorIndex,
      this.halfLifeSeconds
    );
    this.feedbackUC = new FeedbackUseCase(this.feedbackRepo, this.eventBus, this.halfLifeSeconds);
  }

  async init(): Promise<void> {
    await ensureSchema(this.client);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  /**
   * Save a distilled memory with exact dedupe by contentHash.
   */
  async upsertMemory(
    l: any,
    originAgentId?: string,
    taskId?: string | null
  ): Promise<{ id: string; deduped: boolean }> {
    const res = await this.memoryWriter.upsert(l, originAgentId, taskId);
    this.eventBus.emit({
      type: "write",
      action: res.deduped ? "upsertMemory.dedupe" : "upsertMemory",
      meta: { id: res.id },
    });
    return res;
  }

  async upsertCase(c: CaseRecord): Promise<string> {
    const env = ensureEnvHash(c.env);
    const symptoms = [...new Set((c.symptoms ?? []).map(normaliseSymptom).filter(Boolean))];
    const caseId = await this.caseRepo.upsertCase({
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
    this.eventBus.emit({ type: "write", action: "upsertCase", meta: { caseId } });
    return caseId;
  }

  async createCase(c: Omit<CaseRecord, "id"> & { id?: string }): Promise<string> {
    const id = c.id ?? newId("case");
    return this.upsertCase({ ...c, id });
  }

  async saveLearnings(req: SaveLearningRequest): Promise<SaveLearningResult> {
    // policy is request-specific; rebuild validator per request with effective policy
    const pol = defaultPolicy(req.policy);
    this.validator = new LearningValidator(pol, new DefaultSecretScanner());
    this.saveLearningsUC = new SaveLearningsUseCase(this.validator, this.memoryWriter, this.caseRepo, this.eventBus, this.logger);
    return this.saveLearningsUC.execute(req);
  }

  async retrieveContextBundle(args: RetrieveContextArgs): Promise<ContextBundle> {
    return this.retrieveBundleUC.execute(args);
  }

  async retrieveContextBundleWithGraph(args: RetrieveContextBundleWithGraphArgs): Promise<ContextBundleWithGraph> {
    const bundle = await this.retrieveContextBundle(args);
    const ids = [...bundle.sections.fix.map((m) => m.id), ...bundle.sections.doNotDo.map((m) => m.id)];
    const graph = await this.getMemoryGraph({
      agentId: args.agentId,
      memoryIds: ids,
      includeNodes: args.includeNodes ?? false,
      includeRelatedTo: args.includeRelatedTo ?? false,
    });
    return { bundle, graph };
  }

  async listMemories(args: ListMemoriesArgs = {}): Promise<MemorySummary[]> {
    const res = await this.memoryRepo.listMemories(args);
    this.eventBus.emit({ type: "read", action: "listMemories", meta: { count: res.length, kind: args.kind } });
    return res;
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

  async searchMemories(args: SearchMemoriesArgs): Promise<SearchMemorySummary[]> {
    const res = await this.memoryRepo.searchMemories(args, this.fulltextIndex);
    this.eventBus.emit({ type: "read", action: "searchMemories", meta: { count: res.length } });
    return res;
  }

  async search(args: SearchMemoriesArgs): Promise<SearchMemorySummary[]> {
    return this.searchMemories(args);
  }

  async read(ids: string[]): Promise<MemoryRecord[]> {
    return this.getMemoriesById({ ids });
  }

  async getMemoriesById(args: GetMemoriesByIdArgs): Promise<MemoryRecord[]> {
    return this.memoryRepo.getMemoriesById(args);
  }

  async getMemoryGraph(args: GetMemoryGraphArgs): Promise<MemoryGraphResponse> {
    return this.memoryRepo.getMemoryGraph(args);
  }

  async getKnowledgeGraphByTags(args: GetKnowledgeGraphByTagsArgs): Promise<KnowledgeGraphResponse> {
    return this.memoryRepo.getKnowledgeGraphByTags(args);
  }

  async listMemoryEdges(args: ListMemoryEdgesArgs = {}): Promise<MemoryEdgeExport[]> {
    return this.memoryRepo.listMemoryEdges(args);
  }

  async relateConcepts(args: { sourceId: string; targetId: string; weight?: number }): Promise<void> {
    const weight = typeof args.weight === "number" ? args.weight : 0.5;
    await this.memoryRepo.relateConcepts({ a: args.sourceId, b: args.targetId, weight });
    this.eventBus.emit({ type: "write", action: "relateConcepts", meta: { sourceId: args.sourceId, targetId: args.targetId } });
  }

  async feedback(fb: MemoryFeedback): Promise<MemoryFeedbackResult> {
    return this.feedbackUC.execute(fb);
  }

  async link(fromId: string, relType: string, toId: string, props: Record<string, any> = {}): Promise<void> {
    const allowed = new Set([
      "ABOUT",
      "TAGGED",
      "TOUCHED",
      "USED_TOOL",
      "HAS_ERROR_SIG",
      "CO_USED_WITH",
      "RELATED_TO",
      "PRODUCED",
      "WROTE",
      "RAN",
      "HAS_SYMPTOM",
    ]);
    if (!allowed.has(relType)) {
      throw new Error(`Unsupported relType: ${relType}`);
    }
    await this.feedbackRepo.link(fromId, relType, toId, props);
    this.eventBus.emit({ type: "write", action: "link", meta: { fromId, toId, relType } });
  }

  async upsert(memory: any): Promise<{ id: string; deduped: boolean }> {
    const candidate = compileMemoryFromRun({
      agentId: memory.agentId ?? "unknown",
      kind: memory.kind,
      title: memory.title,
      summary: memory.summary,
      whenToUse: memory.whenToUse ?? [],
      howToApply: memory.howToApply ?? [],
      gotchas: memory.gotchas ?? [],
      evidence: memory.evidence ?? [],
      scope: memory.scope,
      tags: memory.tags ?? [],
      outcome: memory.outcome,
      confidence: memory.confidence,
      utility: memory.utility,
    });
    const contentHash =
      memory.contentHash ??
      computeContentHashForCard({
        kind: memory.kind,
        title: memory.title,
        summary: memory.summary,
        whenToUse: memory.whenToUse ?? [],
        howToApply: memory.howToApply ?? [],
        gotchas: memory.gotchas ?? [],
        evidence: memory.evidence ?? [],
        scope: memory.scope,
      });

    return this.upsertMemory(
      {
        ...candidate,
        id: memory.id,
        confidence: memory.confidence,
        utility: memory.utility,
        contentHash,
        validFromIso: memory.validFrom ?? null,
        validToIso: memory.validTo ?? null,
        filePaths: memory.filePaths,
        toolNames: memory.toolNames,
        errorSignatures: memory.errorSignatures,
      },
      memory.agentId,
      memory.taskId ?? null
    );
  }

  async captureEpisode(args: CaptureEpisodeArgs): Promise<SaveLearningResult> {
    const title = `Episode ${args.workflowName} (${args.runId})`;
    const learning = buildEpisodeLearning(args, title);
    const result = await this.saveLearnings({
      agentId: args.agentId,
      sessionId: args.runId,
      taskId: args.runId,
      learnings: [learning],
    });
    this.eventBus.emit({ type: "write", action: "captureEpisode", meta: { runId: args.runId, title } });
    return result;
  }

  async captureUsefulLearning(args: CaptureUsefulLearningArgs): Promise<SaveLearningResult> {
    if (args.useful === false) {
      return { saved: [], rejected: [{ title: args.learning.title, reason: "not marked useful" }] };
    }
    const result = await this.saveLearnings({
      agentId: args.agentId,
      sessionId: args.sessionId,
      taskId: args.sessionId,
      learnings: [args.learning],
    });
    this.eventBus.emit({
      type: "write",
      action: "captureUsefulLearning",
      meta: { title: args.learning.title, savedCount: result.saved.length },
    });
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
      taskId: args.runId,
      learnings: [learning],
    });
    this.eventBus.emit({ type: "write", action: "captureStepEpisode", meta: { runId: args.runId, stepName: args.stepName } });
    return result;
  }
}

export async function createMemoryService(cfg: MemoryServiceConfig): Promise<MemoryService> {
  const svc = new MemoryService(cfg);
  await svc.init();
  return svc;
}
