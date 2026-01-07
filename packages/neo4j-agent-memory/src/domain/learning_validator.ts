import type { LearningCandidate, MemoryPolarity } from "../types.js";
import type { LearningPolicy } from "./learning_policy.js";
import type { SecretScanner } from "./secret_scanner.js";

export class LearningValidator {
  constructor(
    private policy: LearningPolicy,
    private secretScanner: SecretScanner
  ) {}

  validate(l: LearningCandidate): { ok: true } | { ok: false; reason: string } {
    if (!l.title || l.title.trim().length < 4) return { ok: false, reason: "title too short" };
    if (!l.content || l.content.trim().length < 20) return { ok: false, reason: "content too short" };
    if ((l.tags ?? []).length < 1) return { ok: false, reason: "missing tags" };
    if (!(l.confidence >= 0 && l.confidence <= 1)) return { ok: false, reason: "confidence must be 0..1" };
    if (l.confidence < this.policy.minConfidence) return { ok: false, reason: `confidence < ${this.policy.minConfidence}` };
    if (this.secretScanner.hasSecret(l.content)) return { ok: false, reason: "possible secret detected" };

    if (l.kind === "procedural" && this.policy.requireVerificationSteps) {
      const v = l.triage?.verificationSteps?.length ?? 0;
      const f = l.triage?.fixSteps?.length ?? 0;
      if (v < 1) return { ok: false, reason: "procedural requires triage.verificationSteps" };
      if (f < 1) return { ok: false, reason: "procedural requires triage.fixSteps" };
    }

    const polarity: MemoryPolarity = l.polarity ?? "positive";
    if (polarity === "negative") {
      if (!l.antiPattern?.action || !l.antiPattern?.whyBad) {
        return { ok: false, reason: "negative memories require antiPattern.action + antiPattern.whyBad" };
      }
    }
    return { ok: true };
  }
}

