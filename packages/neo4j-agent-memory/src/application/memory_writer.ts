import type { AutoRelateConfig, EnvironmentFingerprint, LearningCandidate, MemoryPolarity } from "../types.js";
import { newId, sha256Hex } from "../utils/hash.js";
import { computeLearningContentHash } from "../domain/memory_hasher.js";
import { collectMemorySymptoms } from "../domain/symptoms.js";
import { ensureEnvHash } from "../domain/environment.js";
import { clamp01 } from "../domain/math.js";
import type { Neo4jMemoryRepository } from "../infrastructure/neo4j/memory_repository.js";

export interface UpsertResult {
  id: string;
  deduped: boolean;
}

export class MemoryWriter {
  constructor(
    private repo: Neo4jMemoryRepository,
    private autoRelateConfig: Required<AutoRelateConfig>
  ) {}

  async upsert(
    learning: LearningCandidate & { id?: string },
    originAgentId?: string,
    taskId?: string | null
  ): Promise<UpsertResult> {
    const id = learning.id ?? newId("mem");
    const polarity: MemoryPolarity = learning.polarity ?? "positive";
    const tags = [...new Set((learning.tags ?? []).map((t) => t.trim()).filter(Boolean))];

    const contentHash = computeLearningContentHash(learning, tags);
    const existingId = await this.repo.findMemoryIdByContentHash(contentHash);
    if (existingId) return { id: existingId, deduped: true };

    const signalSymptoms = collectMemorySymptoms(learning);
    const concepts = [...new Set((learning.concepts ?? []).map((c) => c.trim()).filter(Boolean))];
    const errorSignatures = (learning.errorSignatures ?? []).map((text) => ({
      id: `err:${sha256Hex(String(text))}`,
      text: String(text),
    }));

    await this.repo.upsertMemory({
      agentId: originAgentId ?? null,
      taskId: typeof taskId === "string" && taskId.trim() ? taskId.trim() : null,
      id,
      kind: learning.kind,
      polarity,
      title: learning.title,
      content: learning.content,
      summary: learning.summary ?? null,
      whenToUse: learning.whenToUse ?? null,
      howToApply: learning.howToApply ?? null,
      gotchas: learning.gotchas ?? null,
      scopeRepo: learning.scope?.repo ?? null,
      scopePackage: learning.scope?.package ?? null,
      scopeModule: learning.scope?.module ?? null,
      scopeRuntime: learning.scope?.runtime ?? null,
      scopeVersions: learning.scope?.versions ?? null,
      evidence: learning.evidence ?? null,
      outcome: learning.outcome ?? null,
      validFromIso: learning.validFromIso ?? null,
      validToIso: learning.validToIso ?? null,
      contentHash,
      tags,
      confidence: clamp01(learning.confidence),
      utility: typeof learning.utility === "number" ? clamp01(learning.utility) : 0.2,
      triage: learning.triage ? JSON.stringify(learning.triage) : null,
      signals: learning.signals ? JSON.stringify(learning.signals) : null,
      distilled: learning.distilled ? JSON.stringify(learning.distilled) : null,
      antiPattern: learning.antiPattern ? JSON.stringify(learning.antiPattern) : null,
      concepts,
      symptoms: signalSymptoms,
      filePaths: learning.filePaths ?? null,
      toolNames: learning.toolNames ?? null,
      errorSignatures: errorSignatures.length > 0 ? errorSignatures : null,
    });

    if (learning.env) {
      const env: EnvironmentFingerprint = ensureEnvHash(learning.env);
      await this.repo.attachEnvToMemory({
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
      });
    }

    const autoRelate = this.autoRelateConfig;
    const allowedKinds = autoRelate.allowedKinds ?? [];
    const canAutoRelate =
      autoRelate.enabled &&
      tags.length >= autoRelate.minSharedTags &&
      (allowedKinds.length === 0 || allowedKinds.includes(learning.kind));
    if (canAutoRelate) {
      await this.repo.autoRelateByTags({
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

    return { id, deduped: false };
  }
}

