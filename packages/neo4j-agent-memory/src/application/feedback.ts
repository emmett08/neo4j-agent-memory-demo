import type { MemoryFeedback, MemoryFeedbackResult } from "../types.js";
import { clamp01 } from "../domain/math.js";
import { toBetaEdge } from "../domain/mappers.js";
import type { EventBus } from "../domain/observability.js";
import type { Neo4jFeedbackRepository } from "../infrastructure/neo4j/feedback_repository.js";

export class FeedbackUseCase {
  constructor(
    private repo: Neo4jFeedbackRepository,
    private eventBus: EventBus,
    private halfLifeSeconds: number
  ) {}

  async execute(fb: MemoryFeedback): Promise<MemoryFeedbackResult> {
    const nowIso = new Date().toISOString();
    const used = new Set(fb.usedIds ?? []);
    const useful = new Set(fb.usefulIds ?? []);
    const notUseful = new Set(fb.notUsefulIds ?? []);
    const neutral = new Set(fb.neutralIds ?? []);
    const prevented = new Set(fb.preventedErrorIds ?? []);
    const updateUnratedUsed = fb.updateUnratedUsed ?? true;

    for (const id of prevented) useful.add(id);
    for (const id of useful) notUseful.delete(id);
    for (const id of neutral) notUseful.delete(id);

    for (const id of useful) used.add(id);
    for (const id of notUseful) used.add(id);
    for (const id of neutral) used.add(id);

    const quality = clamp01(fb.metrics?.quality ?? 0.7);
    const hallucRisk = clamp01(fb.metrics?.hallucinationRisk ?? 0.2);
    const baseY = clamp01(quality - 0.7 * hallucRisk);
    const w = 0.5 + 1.5 * quality;

    const yById = new Map<string, number>();
    for (const id of used) {
      if (useful.has(id)) {
        yById.set(id, baseY);
        continue;
      }
      if (notUseful.has(id)) {
        yById.set(id, 0.0);
        continue;
      }
      if (neutral.has(id) || !updateUnratedUsed) {
        yById.set(id, 0.5);
        continue;
      }
      yById.set(id, 0.0);
    }

    const items = [...used].map((memoryId) => ({ memoryId, y: yById.get(memoryId) ?? 0.0, w }));
    if (items.length === 0) return { updated: [] };

    await this.repo.ensureAgent(fb.agentId);
    const feedbackRecords = await this.repo.applyFeedbackBatch({
      agentId: fb.agentId,
      nowIso,
      items,
      halfLifeSeconds: this.halfLifeSeconds,
      aMin: 1e-3,
      bMin: 1e-3,
    });

    const updated = feedbackRecords.map((rec) => {
      const raw = {
        a: rec.get("a"),
        b: rec.get("b"),
        strength: rec.get("strength"),
        evidence: rec.get("evidence"),
        updatedAt: rec.get("updatedAt"),
      };
      return { id: rec.get("id"), edge: toBetaEdge(raw) };
    });

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
      await this.repo.applyCoUsedPairs({
        nowIso,
        pairs,
        halfLifeSeconds: this.halfLifeSeconds,
        aMin: 1e-3,
        bMin: 1e-3,
      });
    }

    this.eventBus.emit({ type: "write", action: "feedback", meta: { agentId: fb.agentId, usedCount: used.size } });
    return { updated };
  }
}

