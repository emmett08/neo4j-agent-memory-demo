import type {
  EnvironmentFingerprint,
  SaveLearningRequest,
  SaveLearningResult,
} from "../types.js";
import { normaliseSymptom, newId } from "../utils/hash.js";
import { defaultPolicy } from "../domain/learning_policy.js";
import { collectMemorySymptoms } from "../domain/symptoms.js";
import { ensureEnvHash } from "../domain/environment.js";
import type { LearningValidator } from "../domain/learning_validator.js";
import type { Logger, EventBus } from "../domain/observability.js";
import type { Neo4jCaseRepository } from "../infrastructure/neo4j/case_repository.js";
import type { MemoryWriter } from "./memory_writer.js";

export class SaveLearningsUseCase {
  constructor(
    private validator: LearningValidator,
    private memoryWriter: MemoryWriter,
    private caseRepo: Neo4jCaseRepository,
    private eventBus: EventBus,
    private logger: Logger
  ) {}

  async execute(req: SaveLearningRequest): Promise<SaveLearningResult> {
    const pol = defaultPolicy(req.policy);
    const limited = (req.learnings ?? []).slice(0, pol.maxItems);

    const saved: SaveLearningResult["saved"] = [];
    const rejected: SaveLearningResult["rejected"] = [];

    const positiveMemoryIds: string[] = [];
    const negativeMemoryIds: string[] = [];
    let firstEnv: EnvironmentFingerprint | undefined;
    let allSymptoms: string[] = [];

    const taskId = req.taskId ?? req.sessionId ?? null;

    for (const l of limited) {
      const v = this.validator.validate(l);
      if (!v.ok) {
        rejected.push({ title: l.title, reason: v.reason });
        continue;
      }

      const res = await this.memoryWriter.upsert(l, req.agentId, taskId);
      saved.push({ id: res.id, kind: l.kind, title: l.title, deduped: res.deduped });

      const polarity = l.polarity ?? "positive";
      if (polarity === "positive") positiveMemoryIds.push(res.id);
      else negativeMemoryIds.push(res.id);

      allSymptoms.push(...collectMemorySymptoms(l));
      if (l.env && !firstEnv) firstEnv = l.env;
    }

    const uniqueSymptoms = [...new Set(allSymptoms.map(normaliseSymptom).filter(Boolean))];
    if (uniqueSymptoms.length > 0 && (positiveMemoryIds.length > 0 || negativeMemoryIds.length > 0)) {
      const caseId = req.sessionId ? `case_${req.sessionId}` : newId("case");
      const env = ensureEnvHash(firstEnv ?? {});
      await this.caseRepo.upsertCase({
        caseId,
        title: req.learnings[0]?.title ?? "Auto-generated case",
        summary: `Case auto-created from ${saved.length} learnings`,
        outcome: "resolved",
        symptoms: uniqueSymptoms,
        env,
        resolvedByMemoryIds: positiveMemoryIds,
        negativeMemoryIds: negativeMemoryIds,
        resolvedAtIso: new Date().toISOString(),
      });

      this.logger.info("Auto-created case", {
        caseId,
        positiveCount: positiveMemoryIds.length,
        negativeCount: negativeMemoryIds.length,
        symptoms: uniqueSymptoms,
      });
    }

    this.eventBus.emit({
      type: "write",
      action: "saveLearnings",
      meta: { savedCount: saved.length, rejectedCount: rejected.length },
    });

    return { saved, rejected };
  }
}

