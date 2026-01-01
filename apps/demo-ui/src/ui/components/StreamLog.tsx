import type { AgentStreamEvent } from "../../domain/types";

export function StreamLog({ events }: { events: AgentStreamEvent[] }) {
  return (
    <div className="pre mono" aria-label="Agent event log">
      {events.length === 0 ? (
        <span style={{ color: "var(--faint)" }}>No events yet.</span>
      ) : (
        events.map((e, idx) => {
          if (e.type === "tool_call") return <div key={idx}>🔧 tool_call: {e.title}</div>;
          if (e.type === "tool_call_update") return <div key={idx}>… tool_update: {e.title}</div>;
          if (e.type === "final") return <div key={idx}>✅ final ({Math.round(e.durationMs)}ms)</div>;
          return (
            <div key={idx} style={{ color: "var(--danger)" }}>
              ⛔ error: {e.message}
            </div>
          );
        })
      )}
    </div>
  );
}
