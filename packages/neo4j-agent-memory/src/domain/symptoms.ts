import type { LearningCandidate } from "../types.js";
import { normaliseSymptom } from "../utils/hash.js";

export function collectMemorySymptoms(l: Pick<LearningCandidate, "triage" | "signals">): string[] {
  const fromTriage = l.triage?.symptoms ?? [];
  const fromSignals = l.signals?.symptoms ?? [];
  return [...new Set([...fromTriage, ...fromSignals].map(normaliseSymptom).filter(Boolean))];
}

