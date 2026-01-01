/**
 * Reusable math primitives for Beta-posterior visualisation.
 *
 * Visual encoding standard:
 * - length: posterior mean μ ∈ (0,1)
 * - glow/opacity: evidence n=a+b (saturating)
 * - whiskers: approximate 95% CI (optional)
 */
export interface BetaPosterior {
  a: number; // > 0
  b: number; // > 0
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function mean({ a, b }: BetaPosterior): number {
  return a / (a + b);
}

export function evidence({ a, b }: BetaPosterior): number {
  return a + b;
}

/**
 * Beta variance: ab / ((a+b)^2 (a+b+1))
 * Lower variance => higher certainty.
 */
export function variance({ a, b }: BetaPosterior): number {
  const n = a + b;
  return (a * b) / (n * n * (n + 1));
}

/**
 * Approximate 95% interval width using normal approximation.
 * This is accurate when evidence is moderate/high; for tiny evidence use as "hint" only.
 */
export function approxCI95Width(beta: BetaPosterior): number {
  const v = variance(beta);
  return 2 * 1.96 * Math.sqrt(v);
}

export function approxCI95Range(beta: BetaPosterior): { lo: number; hi: number; width: number } {
  const m = mean(beta);
  const width = approxCI95Width(beta);
  const half = width / 2;
  const lo = clamp01(m - half);
  const hi = clamp01(m + half);
  return { lo, hi, width: hi - lo };
}

/**
 * Map evidence to a certainty value in [0,1] using a saturating curve:
 * certainty = 1 - exp(-n / halfSaturation)
 *
 * - halfSaturation controls how quickly the curve approaches 1.
 * - For UI use only (not the underlying reinforcement model).
 */
export function certaintyFromEvidence(n: number, halfSaturation: number): number {
  if (halfSaturation <= 0) return 1;
  return 1 - Math.exp(-n / halfSaturation);
}
