import { useMemo, useState } from "react";
import type { ContextBundle, Memory } from "../../domain/types";
import { MemoryInfluenceList } from "./MemoryInfluenceList";
import { SegmentedControl } from "./SegmentedControl";
import { CopyButton } from "./CopyButton";

type Tab = "all" | "fix" | "doNotDo" | "injection";
type SortKey = "relevance" | "probability" | "evidence" | "recency" | "delta";

export interface ContextPreviewProps {
  bundle: ContextBundle | null;
  retrieving?: boolean;
  queryTags: string[];
  onFeedback?: (memoryId: string, useful: boolean) => void;
}

function lower(s: string) {
  return s.toLowerCase();
}

function parseDate(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function metric(m: Memory) {
  const before = m.edgeBefore;
  const after = m.edgeAfter;
  const mu = after?.strength ?? before?.strength ?? 0.5;
  const n = after?.evidence ?? before?.evidence ?? (before ? before.a + before.b : 2);
  const delta = after && before ? (after.strength - before.strength) : 0;
  const updated = parseDate(m.updatedAt);
  return { mu, n, delta, updated };
}

function approxTokens(text: string) {
  // crude but useful: ~4 chars per token in English-ish text
  return Math.max(1, Math.round(text.length / 4));
}

export function ContextPreview({ bundle, retrieving, queryTags, onFeedback }: ContextPreviewProps) {
  const [tab, setTab] = useState<Tab>("all");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [compact, setCompact] = useState(false);

  const q = lower(filter.trim());

  const fixes = bundle?.sections.fix ?? [];
  const doNot = bundle?.sections.doNotDo ?? [];
  const totalMemories = fixes.length + doNot.length;

  const filtered = useMemo(() => {
    function apply(items: Memory[]) {
      let out = items;
      if (q) {
        out = out.filter((m) => {
          const hay = `${m.title} ${m.content} ${(m.tags ?? []).join(" ")}`.toLowerCase();
          return hay.includes(q);
        });
      }

      if (sort !== "relevance") {
        const dir = sort === "recency" ? -1 : -1;
        out = [...out].sort((a, b) => {
          const ma = metric(a);
          const mb = metric(b);
          switch (sort) {
            case "probability":
              return dir * (ma.mu - mb.mu);
            case "evidence":
              return dir * (ma.n - mb.n);
            case "delta":
              return dir * (Math.abs(ma.delta) - Math.abs(mb.delta));
            case "recency":
              return dir * (ma.updated - mb.updated);
            default:
              return 0;
          }
        });
      }

      return out;
    }

    return { fix: apply(fixes), doNot: apply(doNot) };
  }, [fixes, doNot, q, sort]);

  if (retrieving && !bundle) {
    return (
      <div className="contextShell">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="badge">Retrieving…</span>
          <span className="small">Fetching candidate memories and scoring relevance.</span>
        </div>
        <div className="skeletonList" aria-hidden="true">
          <div className="skeletonBar" />
          <div className="skeletonBar" />
          <div className="skeletonBar" />
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="contextEmpty">
        <div className="small" style={{ color: "var(--text-secondary)" }}>
          Click <strong>Retrieve</strong> to preview memories before running the agent.
        </div>
        <div className="small" style={{ marginTop: 8, color: "var(--faint)" }}>
          Tip: tags bias retrieval; symptoms help case-based matching.
        </div>
      </div>
    );
  }

  const fixTokens = approxTokens(bundle.injection.fixBlock);
  const dontTokens = approxTokens(bundle.injection.doNotDoBlock);

  return (
    <div className="contextShell">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="badge badgeOk">
            {totalMemories} {totalMemories === 1 ? "memory" : "memories"}
          </span>
          <span className="badge">{fixes.length} fix</span>
          <span className="badge badgeWarn">{doNot.length} do-not-do</span>
          {retrieving ? <span className="badge">Refreshing…</span> : null}
        </div>

        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <label className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={compact}
              onChange={(e) => setCompact(e.target.checked)}
            />
            Compact
          </label>
        </div>
      </div>

      <div className="contextControls">
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          ariaLabel="Context view"
          options={[
            { value: "all", label: "All", count: totalMemories },
            { value: "fix", label: "Fix", count: fixes.length },
            { value: "doNotDo", label: "Do not do", count: doNot.length },
            { value: "injection", label: "Prompt", count: undefined },
          ]}
        />

        <div className="contextFilterRow">
          <input
            className="textField"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter memories (title, tags, content)…"
          />

          <select className="selectSmall" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="relevance">Sort: relevance</option>
            <option value="probability">Sort: μ (useful)</option>
            <option value="evidence">Sort: n (confidence)</option>
            <option value="delta">Sort: |Δμ| (learning)</option>
            <option value="recency">Sort: recency</option>
          </select>
        </div>

        <div className="contextActions">
          <CopyButton value={bundle.injection.fixBlock} label={`Copy fix (${fixTokens} tok)`} />
          <CopyButton value={bundle.injection.doNotDoBlock} label={`Copy do-not-do (${dontTokens} tok)`} />
          <CopyButton value={`${bundle.injection.fixBlock}\n\n${bundle.injection.doNotDoBlock}`} label="Copy all" />
        </div>
      </div>

      <div className="divider" />

      <div className="contextBody">
        {tab === "injection" ? (
          <div className="contextInjection">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <p className="label" style={{ margin: 0 }}>Prompt injection preview</p>
              <span className="pill">
                <span className="mono">Encoding:</span> length=μ • glow=n • whisker≈CI95 • marker=Δ
              </span>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
              <div className="pre">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <strong>Fix block</strong>
                  <CopyButton value={bundle.injection.fixBlock} label="Copy" />
                </div>
                <div className="mono">{bundle.injection.fixBlock}</div>
              </div>

              <div className="pre">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <strong>Do not do block</strong>
                  <CopyButton value={bundle.injection.doNotDoBlock} label="Copy" />
                </div>
                <div className="mono">{bundle.injection.doNotDoBlock}</div>
              </div>
            </div>
          </div>
        ) : null}

        {tab !== "injection" ? (
          <>
            {tab === "all" || tab === "fix" ? (
              filtered.fix.length > 0 ? (
                <MemoryInfluenceList
                  title="✓ Fix memories"
                  items={filtered.fix}
                  kind="fix"
                  queryTags={queryTags}
                  compact={compact}
                  viz={{ showTooltip: true, showWhiskers: true }}
                  onFeedback={onFeedback}
                />
              ) : (
                tab !== "all" ? <div className="small" style={{ color: "var(--faint)" }}>No fix memories match your filter.</div> : null
              )
            ) : null}

            {tab === "all" || tab === "doNotDo" ? (
              filtered.doNot.length > 0 ? (
                <MemoryInfluenceList
                  title="⚠ Do not do"
                  items={filtered.doNot}
                  kind="doNotDo"
                  queryTags={queryTags}
                  compact={compact}
                  viz={{ showTooltip: true, showWhiskers: true }}
                  onFeedback={onFeedback}
                />
              ) : (
                tab !== "all" ? <div className="small" style={{ color: "var(--faint)" }}>No do-not-do memories match your filter.</div> : null
              )
            ) : null}

            {totalMemories === 0 ? (
              <div className="small" style={{ color: "var(--faint)" }}>
                No memories were retrieved. Try adding symptoms and tags, or broaden the prompt description.
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
