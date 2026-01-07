import type { MemoryPolarity, MemoryRecord } from "../types.js";
import { parseJsonField, toDateString } from "./json.js";

export function toBetaEdge(raw: any): { a: number; b: number; strength: number; evidence: number; updatedAt: string | null } {
  const aMin = 1e-3;
  const bMin = 1e-3;
  const strength = typeof raw?.strength === "number" ? raw.strength : 0.5;
  const a = typeof raw?.a === "number" ? raw.a : Math.max(aMin, strength * 2.0);
  const b = typeof raw?.b === "number" ? raw.b : Math.max(bMin, (1.0 - strength) * 2.0);
  const ev = typeof raw?.evidence === "number" ? raw.evidence : (a + b);
  return {
    a,
    b,
    strength: typeof raw?.strength === "number" ? raw.strength : (a / (a + b)),
    evidence: ev,
    updatedAt: raw?.updatedAt ?? null,
  };
}

export function toMemoryRecord(raw: any): MemoryRecord {
  return {
    id: raw.id,
    kind: raw.kind,
    polarity: raw.polarity ?? "positive",
    title: raw.title,
    content: raw.content,
    summary: raw.summary ?? undefined,
    whenToUse: raw.whenToUse ?? undefined,
    howToApply: raw.howToApply ?? undefined,
    gotchas: raw.gotchas ?? undefined,
    scope:
      raw.scopeRepo || raw.scopePackage || raw.scopeModule || raw.scopeRuntime || raw.scopeVersions
        ? {
            repo: raw.scopeRepo ?? undefined,
            package: raw.scopePackage ?? undefined,
            module: raw.scopeModule ?? undefined,
            runtime: raw.scopeRuntime ?? undefined,
            versions: raw.scopeVersions ?? undefined,
          }
        : undefined,
    evidence: raw.evidence ?? undefined,
    outcome: raw.outcome ?? undefined,
    validFrom: toDateString(raw.validFrom),
    validTo: toDateString(raw.validTo),
    tags: raw.tags ?? [],
    confidence: raw.confidence ?? 0.7,
    utility: raw.utility ?? 0.2,
    createdAt: toDateString(raw.createdAt),
    updatedAt: toDateString(raw.updatedAt),
    triage: parseJsonField(raw.triage),
    signals: parseJsonField(raw.signals),
    distilled: parseJsonField(raw.distilled),
    antiPattern: parseJsonField(raw.antiPattern),
    env: raw.env ?? undefined,
  };
}

export function mapContextSummary(m: any, fallbackPolarity: MemoryPolarity) {
  return {
    id: m.id,
    kind: m.kind,
    polarity: m.polarity ?? fallbackPolarity,
    title: m.title,
    content: m.content,
    tags: m.tags ?? [],
    confidence: m.confidence ?? 0.7,
    utility: m.utility ?? 0.2,
    updatedAt: m.updatedAt?.toString?.() ?? null,
  };
}

