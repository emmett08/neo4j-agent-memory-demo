import type { LearningCandidate } from "../types.js";
import { canonicaliseForHash, sha256Hex } from "../utils/hash.js";

function canonicalCardLines(l: Pick<
  LearningCandidate,
  "content" | "summary" | "whenToUse" | "howToApply" | "gotchas" | "scope" | "evidence" | "outcome"
>): string {
  const lines: string[] = [];
  if (l.summary) lines.push(`summary:${l.summary}`);
  if (l.outcome) lines.push(`outcome:${l.outcome}`);
  for (const x of l.whenToUse ?? []) lines.push(`whenToUse:${x}`);
  for (const x of l.howToApply ?? []) lines.push(`howToApply:${x}`);
  for (const x of l.gotchas ?? []) lines.push(`gotchas:${x}`);
  if (l.scope?.repo) lines.push(`scope.repo:${l.scope.repo}`);
  if (l.scope?.package) lines.push(`scope.package:${l.scope.package}`);
  if (l.scope?.module) lines.push(`scope.module:${l.scope.module}`);
  if (l.scope?.runtime) lines.push(`scope.runtime:${l.scope.runtime}`);
  for (const x of l.scope?.versions ?? []) lines.push(`scope.versions:${x}`);
  for (const x of l.evidence ?? []) lines.push(`evidence:${x}`);
  lines.push(`content:${l.content ?? ""}`);
  return lines.join("\n");
}

export function computeLearningContentHash(l: LearningCandidate, canonicalTags: string[]): string {
  if (typeof l.contentHash === "string" && l.contentHash.trim()) return l.contentHash.trim();
  return sha256Hex(canonicaliseForHash(l.title, canonicalCardLines(l), canonicalTags));
}

