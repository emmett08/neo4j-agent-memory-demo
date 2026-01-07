import type { SaveLearningRequest } from "../types.js";

export interface LearningPolicy {
  minConfidence: number;
  requireVerificationSteps: boolean;
  maxItems: number;
}

export function defaultPolicy(req?: SaveLearningRequest["policy"]): LearningPolicy {
  return {
    minConfidence: req?.minConfidence ?? 0.65,
    requireVerificationSteps: req?.requireVerificationSteps ?? true,
    maxItems: req?.maxItems ?? 5,
  };
}

