import type { LearningCandidate, MemoryOutcome, MemoryScope } from "./types.js";
import { sha256Hex } from "./utils/hash.js";

export interface RunLog {
  agentId: string;
  taskId?: string;
  kind: LearningCandidate["kind"];
  title: string;
  summary: string;
  whenToUse: string[];
  howToApply: string[];
  gotchas: string[];
  evidence: string[];
  scope?: MemoryScope;
  tags: string[];
  outcome: MemoryOutcome;
  confidence: number;
  utility?: number;
}

export function computeContentHashForCard(card: Pick<
  RunLog,
  "kind" | "title" | "summary" | "whenToUse" | "howToApply" | "gotchas" | "evidence" | "scope"
>): string {
  const scope = card.scope ?? {};
  const payload = {
    kind: card.kind,
    title: card.title.trim(),
    summary: card.summary.trim(),
    whenToUse: (card.whenToUse ?? []).map((x) => x.trim()).filter(Boolean),
    howToApply: (card.howToApply ?? []).map((x) => x.trim()).filter(Boolean),
    gotchas: (card.gotchas ?? []).map((x) => x.trim()).filter(Boolean),
    evidence: (card.evidence ?? []).map((x) => x.trim()).filter(Boolean),
    scope: {
      repo: scope.repo ?? null,
      package: scope.package ?? null,
      module: scope.module ?? null,
      runtime: scope.runtime ?? null,
      versions: scope.versions ?? null,
    },
  };
  return sha256Hex(JSON.stringify(payload));
}

export function compileMemoryFromRun(log: RunLog): LearningCandidate {
  const content = [
    `Summary: ${log.summary}`,
    ...(log.whenToUse.length ? ["", "When to use:", ...log.whenToUse.map((x) => `- ${x}`)] : []),
    ...(log.howToApply.length ? ["", "How to apply:", ...log.howToApply.map((x) => `- ${x}`)] : []),
    ...(log.gotchas.length ? ["", "Gotchas:", ...log.gotchas.map((x) => `- ${x}`)] : []),
    ...(log.evidence.length ? ["", "Evidence:", ...log.evidence.map((x) => `- ${x}`)] : []),
  ].join("\n").trim();

  return {
    kind: log.kind,
    title: log.title,
    content,
    summary: log.summary,
    whenToUse: log.whenToUse,
    howToApply: log.howToApply,
    gotchas: log.gotchas,
    evidence: log.evidence,
    scope: log.scope,
    tags: log.tags,
    outcome: log.outcome,
    confidence: log.confidence,
    utility: log.utility,
  };
}

