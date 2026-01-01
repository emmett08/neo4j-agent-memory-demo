import type { Memory } from "../../domain/types";
import { MemoryCard } from "./MemoryCard";

export interface MemoryInfluenceListProps {
  title: string;
  items: Memory[];
  kind: "fix" | "doNotDo";
  queryTags: string[];
  compact?: boolean;

  /** Visual policy knobs (reusable across tools) */
  viz?: {
    showTooltip?: boolean;
    showWhiskers?: boolean;
    evidenceHalfSaturation?: number;
    evidenceMax?: number;
  };

  onFeedback?: (memoryId: string, useful: boolean) => void;
}

export function MemoryInfluenceList({ title, items, kind, queryTags, compact, viz, onFeedback }: MemoryInfluenceListProps) {
  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <p
        className="label"
        style={{
          marginBottom: 8,
          color: kind === "fix" ? "var(--success)" : "var(--warning)",
          fontWeight: 800,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span>{title}</span>
        <span className="badge">{items.length}</span>
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((m) => (
          <MemoryCard key={m.id} memory={m} queryTags={queryTags} compact={compact} viz={viz} onFeedback={onFeedback} />
        ))}
      </div>
    </div>
  );
}
