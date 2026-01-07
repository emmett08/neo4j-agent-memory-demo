import type { CaptureEpisodeArgs, LearningCandidate } from "../types.js";
import { compileMemoryFromRun } from "../memory_compiler.js";

export function extractSignalCandidates(text: string): string[] {
  const s = text ?? "";
  const matches = new Set<string>();
  const patterns = [
    /\bE[A-Z]{3,6}\b/g,
    /\b[A-Z][A-Z0-9_]{2,}\b/g,
    /\b(?:error|exception|denied|failed|permission)\b[^.\n]{0,80}/gi,
    /`([^`]{4,80})`/g,
    /'([^']{4,80})'/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const candidate = (m[1] ?? m[0]).trim();
      if (candidate.length < 4) continue;
      if (candidate.length > 120) continue;
      matches.add(candidate);
      if (matches.size >= 8) break;
    }
  }
  return [...matches].slice(0, 8);
}

export function extractBulletLines(text: string, max = 8): string[] {
  const lines = (text ?? "").split("\n").map((l) => l.trim());
  const out: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (/^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      out.push(line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, ""));
      if (out.length >= max) break;
    }
  }
  return out;
}

export function buildEpisodeLearning(args: CaptureEpisodeArgs, title: string): LearningCandidate {
  const signals = extractSignalCandidates(args.prompt);
  const steps = extractBulletLines(args.response, 8);
  const responsePreview = args.response.trim().split("\n").filter(Boolean)[0] ?? "";
  const outcome =
    args.outcome === "success"
      ? "success"
      : args.outcome === "partial"
        ? "partial"
        : args.outcome === "failure"
          ? "dead_end"
          : undefined;

  return compileMemoryFromRun({
    agentId: args.agentId,
    kind: "episodic",
    title,
    summary: responsePreview ? responsePreview.slice(0, 240) : "Episode outcome recorded.",
    whenToUse: signals,
    howToApply: steps,
    gotchas: [],
    evidence: outcome ? [`outcome:${outcome}`] : [],
    tags: args.tags ?? [],
    outcome: outcome ?? "partial",
    confidence: 0.7,
  });
}

