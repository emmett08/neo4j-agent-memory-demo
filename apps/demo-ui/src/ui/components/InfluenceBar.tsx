import { useMemo } from "react";
import {
  approxCI95Range,
  certaintyFromEvidence,
  evidence,
  mean,
  type BetaPosterior,
} from "../viz/influenceMath";
import { Tooltip } from "./Tooltip";

export type InfluenceDelta = "up" | "down" | "flat";

export interface InfluenceBarProps {
  /** Stable id, used for aria labels and test ids */
  id: string;

  /** Display label (memory title, case title, etc.) */
  label: string;

  /** Optional small hint line (tags, kind) */
  meta?: string;

  /** Beta posterior before the run */
  before: BetaPosterior;

  /** Beta posterior after the run (optional until feedback arrives) */
  after?: BetaPosterior;

  /** Optional: show breakdown tooltip */
  showTooltip?: boolean;

  /** Controls how evidence is mapped to certainty/glow */
  evidence: {
    /** Evidence at which we consider the posterior “confident” for UI purposes */
    halfSaturation: number; // e.g. 8, 12, 20
    /** Max evidence used for scaling (caps out visually) */
    max: number; // e.g. 50
  };

  /** Animation behaviour on update */
  motion?: {
    /** Animate when after arrives */
    animateOnChange?: boolean;
    /** ms */
    durationMs?: number;
  };

  /** Optional uncertainty rendering */
  uncertainty?: {
    /** Draw an approximate 95% CI whisker band */
    showWhiskers?: boolean;
  };

  /** Polarity affects colour and left stripe */
  polarity?: "positive" | "negative";

  /** When user clicks the row */
  onSelect?: (id: string) => void;

  /** Optional: override numeric formatting */
  format?: {
    probability?: (p: number) => string; // default: 0–100%
    evidence?: (n: number) => string; // default: n as integer
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function InfluenceBar(props: InfluenceBarProps) {
  const {
    id,
    label,
    meta,
    before,
    after,
    evidence: evCfg,
    showTooltip,
    motion,
    uncertainty,
    polarity = "positive",
    onSelect,
    format,
  } = props;

  const beforeMean = useMemo(() => mean(before), [before]);
  const beforeN = useMemo(() => evidence(before), [before]);

  const afterMean = useMemo(() => (after ? mean(after) : null), [after]);
  const afterN = useMemo(() => (after ? evidence(after) : null), [after]);

  const shownMean = afterMean ?? beforeMean;
  const shownN = afterN ?? beforeN;

  const certainty = useMemo(() => {
    const capped = Math.min(shownN, evCfg.max);
    return certaintyFromEvidence(capped, evCfg.halfSaturation);
  }, [shownN, evCfg.halfSaturation, evCfg.max]);

  const delta = afterMean == null ? 0 : afterMean - beforeMean;
  const deltaDir: InfluenceDelta =
    afterMean == null ? "flat" : delta > 0.01 ? "up" : delta < -0.01 ? "down" : "flat";

  const probFmt = format?.probability ?? ((p: number) => `${Math.round(p * 100)}%`);
  const evidFmt = format?.evidence ?? ((n: number) => `${Math.round(n)}`);

  const fillPct = Math.round(clamp01(shownMean) * 100);
  const beforePct = Math.round(clamp01(beforeMean) * 100);
  const afterPct = afterMean == null ? null : Math.round(clamp01(afterMean) * 100);

  const animate = motion?.animateOnChange ?? true;
  const duration = motion?.durationMs ?? 180;

  const whiskers = useMemo(() => {
    if (!uncertainty?.showWhiskers) return null;
    const src = after ?? before;
    const r = approxCI95Range(src);
    return { leftPct: Math.round(r.lo * 100), widthPct: Math.round(r.width * 100) };
  }, [uncertainty?.showWhiskers, after, before]);

  const titleLines: string[] = [
    label,
    `μ: ${probFmt(shownMean)}  n: ${evidFmt(shownN)}`,
    `before: a=${before.a.toFixed(3)} b=${before.b.toFixed(3)} (μ=${probFmt(beforeMean)})`,
  ];
  if (after) {
    titleLines.push(`after:  a=${after.a.toFixed(3)} b=${after.b.toFixed(3)} (μ=${probFmt(afterMean ?? shownMean)})`);
    titleLines.push(`Δμ: ${probFmt(Math.abs(delta))} (${deltaDir})`);
  }
  const title = titleLines.join("\n");

  return (
    <div
      className={`influenceRow ${polarity === "negative" ? "influenceNegative" : ""}`}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.(id)}
      onKeyDown={(e) => e.key === "Enter" && onSelect?.(id)}
      aria-label={`${label}. Strength ${probFmt(shownMean)}. Evidence ${evidFmt(shownN)}.`}
      data-testid={`influence-${id}`}
    >
      <div className="influenceTop">
        <div className="influenceText">
          <div className="influenceLabel">{label}</div>
          {meta ? <div className="influenceMeta">{meta}</div> : null}
        </div>
        <div className="influenceNums">
          <div className="influenceProb">{probFmt(shownMean)}</div>
          <div className="influenceEv">n={evidFmt(shownN)}</div>
          {showTooltip ? (
            <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
              <Tooltip
                label="Show posterior details"
                content={
                  <div className="tooltipGrid">
                    <div className="tooltipHead">Beta posterior</div>
                    <div className="tooltipRow">
                      <span className="tooltipKey">μ</span>
                      <span className="tooltipVal">{probFmt(shownMean)}</span>
                    </div>
                    <div className="tooltipRow">
                      <span className="tooltipKey">n=a+b</span>
                      <span className="tooltipVal">{evidFmt(shownN)}</span>
                    </div>
                    <div className="tooltipRow">
                      <span className="tooltipKey">before (a,b)</span>
                      <span className="tooltipVal">{before.a.toFixed(3)}, {before.b.toFixed(3)}</span>
                    </div>
                    {after ? (
                      <div className="tooltipRow">
                        <span className="tooltipKey">after (a,b)</span>
                        <span className="tooltipVal">{after.a.toFixed(3)}, {after.b.toFixed(3)}</span>
                      </div>
                    ) : null}
                    {uncertainty?.showWhiskers ? (
                      <div className="tooltipRow">
                        <span className="tooltipKey">CI (≈95%)</span>
                        <span className="tooltipVal">
                          {(() => {
                            const r = approxCI95Range(after ?? before);
                            return `${Math.round(r.lo * 100)}–${Math.round(r.hi * 100)}%`;
                          })()}
                        </span>
                      </div>
                    ) : null}
                    {after ? (
                      <div className="tooltipRow">
                        <span className="tooltipKey">Δμ</span>
                        <span className="tooltipVal">
                          {deltaDir === "up" ? "↑" : deltaDir === "down" ? "↓" : "→"} {probFmt(Math.abs(delta))}
                        </span>
                      </div>
                    ) : null}
                  </div>
                }
              />
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="influenceTrack"
        aria-hidden="true"
        title={showTooltip ? undefined : title}
        style={{
          // pass values through for CSS-friendly consumption if needed later
          ["--vizCertainty" as any]: String(certainty),
          ["--vizDurationMs" as any]: `${duration}ms`,
        }}
      >
        <div className="influenceGlow" style={{ opacity: 0.10 + 0.40 * certainty }} />

        {whiskers ? (
          <div
            className="influenceWhisker"
            style={{ left: `${whiskers.leftPct}%`, width: `${whiskers.widthPct}%` }}
          />
        ) : null}

        <div
          className="influenceFill"
          style={{
            width: `${fillPct}%`,
            transition: animate ? `width ${duration}ms ease` : undefined,
          }}
        />

        <div className="influenceMarker influenceMarkerBefore" style={{ left: `${beforePct}%` }} />

        {afterPct != null ? (
          <div
            className={`influenceMarker influenceMarkerAfter ${
              deltaDir === "up" ? "isUp" : deltaDir === "down" ? "isDown" : ""
            }`}
            style={{
              left: `${afterPct}%`,
              transition: animate ? `left ${duration}ms ease` : undefined,
            }}
          />
        ) : null}
      </div>

      {afterMean != null ? (
        <div className="influenceDelta">
          <span>
            Δ {deltaDir === "up" ? "↑" : deltaDir === "down" ? "↓" : "→"} {probFmt(Math.abs(delta))}
          </span>
          <span className="influenceDeltaRight">
            {deltaDir === "up" ? "reinforced" : deltaDir === "down" ? "degraded" : "unchanged"}
          </span>
        </div>
      ) : (
        <div className="influenceDelta">
          <span style={{ color: "var(--faint)" }}>Awaiting feedback…</span>
        </div>
      )}
    </div>
  );
}
