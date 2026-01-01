import { useMemo, useState } from "react";
import type { Memory } from "../../domain/types";
import { InfluenceBar } from "./InfluenceBar";
import { CopyButton } from "./CopyButton";

export interface MemoryCardProps {
  memory: Memory;
  queryTags: string[];
  compact?: boolean;
  viz?: {
    showTooltip?: boolean;
    showWhiskers?: boolean;
    evidenceHalfSaturation?: number;
    evidenceMax?: number;
  };
  onFeedback?: (memoryId: string, useful: boolean) => void;
}

const kindIcon: Record<string, string> = {
  semantic: "Σ",
  procedural: "⚙",
  episodic: "📓",
};

function safeDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function relativeTime(iso?: string | null): string | null {
  const d = safeDate(iso);
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function MemoryCard({ memory, queryTags, compact, viz, onFeedback }: MemoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [feedbackState, setFeedbackState] = useState<"idle" | "useful" | "not-useful">("idle");

  const before = useMemo(() => {
    const e = memory.edgeBefore;
    return { a: e?.a ?? 1, b: e?.b ?? 1 };
  }, [memory.edgeBefore]);

  const after = useMemo(() => {
    const e = memory.edgeAfter;
    return e ? { a: e.a, b: e.b } : undefined;
  }, [memory.edgeAfter]);

  const evidenceHalfSaturation = viz?.evidenceHalfSaturation ?? 12;
  const evidenceMax = viz?.evidenceMax ?? 50;

  const tags = memory.tags ?? [];
  const matched = useMemo(() => new Set(queryTags.map((t) => t.toLowerCase())), [queryTags]);
  const rel = relativeTime(memory.updatedAt);

  const snippet = useMemo(() => {
    const text = memory.content ?? "";
    const clean = text.replace(/\s+/g, " ").trim();
    if (expanded || clean.length <= 200) return clean;
    return clean.slice(0, 200) + "…";
  }, [memory.content, expanded]);

  const icon = kindIcon[memory.kind] ?? "•";

  return (
    <div className="memoryCard">
      <InfluenceBar
        id={memory.id}
        label={`${icon} ${memory.title}`}
        meta={`${memory.kind} • ${memory.polarity}${rel ? ` • ${rel}` : ""}`}
        before={before}
        after={after}
        showTooltip={viz?.showTooltip ?? true}
        uncertainty={{ showWhiskers: viz?.showWhiskers ?? true }}
        evidence={{ halfSaturation: evidenceHalfSaturation, max: evidenceMax }}
        motion={{ animateOnChange: true, durationMs: 180 }}
        polarity={memory.polarity}
      />

      <div className={`memoryBody ${compact ? "isCompact" : ""}`}>
        <div className="memoryTags">
          {tags.slice(0, 10).map((t) => {
            const isMatch = matched.has(t.toLowerCase());
            return (
              <span key={t} className={`tagChip ${isMatch ? "isMatch" : ""}`}>
                {t}
              </span>
            );
          })}
          {tags.length > 10 ? <span className="tagChip">+{tags.length - 10}</span> : null}
        </div>

        <div className="memoryContent">
          <p className="small" style={{ margin: 0, color: "var(--text-secondary)" }}>
            {snippet || <span style={{ color: "var(--faint)" }}>(empty content)</span>}
          </p>
        </div>

        <div className="memoryActions">
          {onFeedback && (
            <div style={{ display: "flex", gap: 8, marginRight: "auto" }}>
              <button
                type="button"
                className="btn btnSmall"
                onClick={() => {
                  setFeedbackState("useful");
                  onFeedback(memory.id, true);
                }}
                disabled={feedbackState !== "idle"}
                style={{
                  background: feedbackState === "useful" ? "rgba(134,239,172,0.18)" : undefined,
                  borderColor: feedbackState === "useful" ? "rgba(134,239,172,0.35)" : undefined,
                }}
                title="This memory was helpful"
              >
                👍 {feedbackState === "useful" ? "Helpful!" : "Helpful"}
              </button>
              <button
                type="button"
                className="btn btnSmall"
                onClick={() => {
                  setFeedbackState("not-useful");
                  onFeedback(memory.id, false);
                }}
                disabled={feedbackState !== "idle"}
                style={{
                  background: feedbackState === "not-useful" ? "rgba(248,113,113,0.18)" : undefined,
                  borderColor: feedbackState === "not-useful" ? "rgba(248,113,113,0.35)" : undefined,
                }}
                title="This memory was not helpful"
              >
                👎 {feedbackState === "not-useful" ? "Not helpful" : "Not helpful"}
              </button>
            </div>
          )}
          <CopyButton value={`${memory.title}\n\n${memory.content}`} label="Copy" />
          <button type="button" className="btn btnSmall" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
    </div>
  );
}
