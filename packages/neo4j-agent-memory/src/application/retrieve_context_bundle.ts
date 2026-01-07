import type {
  ContextBundle,
  EnvironmentFingerprint,
  MemoryPolarity,
  RetrieveContextArgs,
} from "../types.js";
import { newId, normaliseSymptom } from "../utils/hash.js";
import { ensureEnvHash } from "../domain/environment.js";
import { mapContextSummary, toBetaEdge } from "../domain/mappers.js";
import type { EventBus } from "../domain/observability.js";
import type { Neo4jRetrievalRepository } from "../infrastructure/neo4j/retrieval_repository.js";

export class RetrieveContextBundleUseCase {
  constructor(
    private retrievalRepo: Neo4jRetrievalRepository,
    private eventBus: EventBus,
    private fulltextIndex: string,
    private vectorIndex: string,
    private halfLifeSeconds: number
  ) {}

  async execute(args: RetrieveContextArgs): Promise<ContextBundle> {
    const nowIso = args.nowIso ?? new Date().toISOString();
    const symptoms = [...new Set((args.symptoms ?? []).map(normaliseSymptom).filter(Boolean))];
    const env: EnvironmentFingerprint = ensureEnvHash(args.env ?? {});
    const caseLimit = args.caseLimit ?? 5;
    const fixLimit = args.fixLimit ?? 8;
    const dontLimit = args.dontLimit ?? 6;

    const sections = (await this.retrievalRepo.retrieveContextBundle({
      agentId: args.agentId,
      symptoms,
      tags: args.tags ?? [],
      env,
      caseLimit,
      fixLimit,
      dontLimit,
      nowIso,
      halfLifeSeconds: this.halfLifeSeconds,
    })) as { fixes: any[]; doNot: any[] };

    let fixes = (sections.fixes ?? []).map((m: any) => mapContextSummary(m, "positive" as MemoryPolarity));
    let doNot = (sections.doNot ?? []).map((m: any) => mapContextSummary(m, "negative" as MemoryPolarity));

    const fallback = args.fallback ?? {};
    const shouldFallback = fallback.enabled === true && fixes.length === 0 && doNot.length === 0;
    if (shouldFallback) {
      const fallbackFixLimit = fallback.limit ?? fixLimit;
      const fallbackDontLimit = fallback.limit ?? dontLimit;
      try {
        const fbSections = (await this.retrievalRepo.fallbackRetrieveMemories({
          prompt: args.prompt ?? "",
          tags: args.tags ?? [],
          kinds: args.kinds ?? [],
          fulltextIndex: this.fulltextIndex,
          vectorIndex: this.vectorIndex,
          embedding: fallback.embedding ?? null,
          useFulltext: fallback.useFulltext ?? true,
          useVector: fallback.useVector ?? false,
          useTags: fallback.useTags ?? true,
          fixLimit: fallbackFixLimit,
          dontLimit: fallbackDontLimit,
        })) as { fixes: any[]; doNot: any[] } | undefined;
        fixes = (fbSections?.fixes ?? []).map((m: any) => mapContextSummary(m, "positive"));
        doNot = (fbSections?.doNot ?? []).map((m: any) => mapContextSummary(m, "negative"));
      } catch (err) {
        this.eventBus.emit({
          type: "read",
          action: "retrieveContextBundle.fallbackError",
          meta: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    const allIds = [...new Set([...fixes.map((x) => x.id), ...doNot.map((x) => x.id)])];
    const edgeAfter = allIds.length > 0 ? await this.retrievalRepo.getRecallEdges(args.agentId, allIds) : new Map();

    const fixesWithEdges = fixes.map((m: any) => ({
      ...m,
      edgeBefore: toBetaEdge(edgeAfter.get(m.id)),
      edgeAfter: undefined,
    }));
    const doNotWithEdges = doNot.map((m: any) => ({
      ...m,
      edgeBefore: toBetaEdge(edgeAfter.get(m.id)),
      edgeAfter: undefined,
    }));

    const sessionId = newId("session");
    const fixBlock =
      "## Recommended fixes\n" +
      fixesWithEdges.map((m: any) => `\n\n### [MEM:${m.id}] ${m.title}\n${m.content}`).join("");
    const doNotDoBlock =
      "## Do not do\n" +
      doNotWithEdges.map((m: any) => `\n\n### [MEM:${m.id}] ${m.title}\n${m.content}`).join("");

    this.eventBus.emit({
      type: "read",
      action: "retrieveContextBundle",
      meta: { sessionId, fixCount: fixesWithEdges.length, doNotCount: doNotWithEdges.length },
    });

    return {
      sessionId,
      sections: { fix: fixesWithEdges, doNotDo: doNotWithEdges },
      injection: { fixBlock, doNotDoBlock },
    };
  }
}

