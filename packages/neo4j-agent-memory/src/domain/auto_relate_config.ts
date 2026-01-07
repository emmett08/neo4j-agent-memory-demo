import type { AutoRelateConfig } from "../types.js";
import { clamp01 } from "./math.js";

const DEFAULT_AUTO_RELATE: Required<AutoRelateConfig> = {
  enabled: true,
  minSharedTags: 2,
  minWeight: 0.2,
  maxCandidates: 12,
  sameKind: true,
  samePolarity: true,
  allowedKinds: ["semantic", "procedural"],
};

const AUTO_RELATE_MIN_SHARED_TAGS = 1;
const AUTO_RELATE_MIN_MAX_CANDIDATES = 1;

export function buildAutoRelateConfig(cfg?: AutoRelateConfig): Required<AutoRelateConfig> {
  const autoRelate = cfg ?? {};
  return {
    enabled: autoRelate.enabled ?? DEFAULT_AUTO_RELATE.enabled,
    minSharedTags: Math.max(AUTO_RELATE_MIN_SHARED_TAGS, Math.floor(autoRelate.minSharedTags ?? DEFAULT_AUTO_RELATE.minSharedTags)),
    minWeight: clamp01(autoRelate.minWeight ?? DEFAULT_AUTO_RELATE.minWeight),
    maxCandidates: Math.max(
      AUTO_RELATE_MIN_MAX_CANDIDATES,
      Math.floor(autoRelate.maxCandidates ?? DEFAULT_AUTO_RELATE.maxCandidates)
    ),
    sameKind: autoRelate.sameKind ?? DEFAULT_AUTO_RELATE.sameKind,
    samePolarity: autoRelate.samePolarity ?? DEFAULT_AUTO_RELATE.samePolarity,
    allowedKinds: autoRelate.allowedKinds ?? [...DEFAULT_AUTO_RELATE.allowedKinds],
  };
}

