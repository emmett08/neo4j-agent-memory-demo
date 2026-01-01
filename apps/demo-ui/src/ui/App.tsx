import { useMemo, useReducer } from "react";
import { ApiClient } from "../services/apiClient";
import { ChipInput } from "./components/ChipInput";
import { SelectField } from "./components/SelectField";
import { Toggle } from "./components/Toggle";
import { StreamLog } from "./components/StreamLog";
import { AnswerPanel } from "./components/AnswerPanel";
import { ContextPreview } from "./components/ContextPreview";
import { initialState, reducer } from "../state/appState";
import type { EnvironmentFingerprint } from "../domain/types";

type OS = "macos" | "linux" | "windows";
type PM = "npm" | "pnpm" | "yarn";

const osOptions = [
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" },
  { value: "windows", label: "Windows" },
] as const;

const pmOptions = [
  { value: "npm", label: "npm" },
  { value: "pnpm", label: "pnpm" },
  { value: "yarn", label: "yarn" },
] as const;

function mergeEnv(env: EnvironmentFingerprint, patch: Partial<EnvironmentFingerprint>): EnvironmentFingerprint {
  return { ...env, ...patch };
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const api = useMemo(() => new ApiClient(""), []);

  const running = state.status === "running";
  const retrieving = state.status === "retrieving";
  const busy = running || retrieving;

  function buildBaseline(bundle: any): Record<string, { a: number; b: number }> {
  const out: Record<string, { a: number; b: number }> = {};
  if (!bundle?.sections) return out;
  const all = [...(bundle.sections.fix ?? []), ...(bundle.sections.doNotDo ?? [])];
  for (const m of all) {
    const edge = m.edgeAfter ?? m.edgeBefore;
    if (edge && typeof edge.a === "number" && typeof edge.b === "number") {
      out[m.id] = { a: edge.a, b: edge.b };
    }
  }
  return out;
}

const onRetrieve = async () => {
    dispatch({ type: "retrieve_start" });

    try {
      const bundle = await api.retrieveMemory({
        agentId: "auggie",
        prompt: state.prompt,
        symptoms: state.symptoms,
        tags: state.tags,
        env: state.env,
      });
      dispatch({ type: "retrieve_success", bundle });
    } catch (e: any) {
      dispatch({ type: "retrieve_error", error: e?.message ?? String(e) });
    }
  };

  const onRun = async () => {
    dispatch({ type: "start" });

    const controller = new AbortController();
    const abort = () => controller.abort();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") abort();
    };
    window.addEventListener("keydown", onKey);

    try {
      await api.runAgentStream(
        {
          agentId: "auggie",
          prompt: state.prompt,
          symptoms: state.symptoms,
          tags: state.tags,
          env: state.env,
        },
        (ev) => dispatch({ type: "event", event: ev }),
        controller.signal
      );

      // After the run, re-retrieve using the previous posteriors as baseline, so UI can show before/after deltas.
      if (state.contextBundle) {
        const baseline = buildBaseline(state.contextBundle);
        const next = await api.retrieveMemory({
          agentId: "auggie",
          prompt: state.prompt,
          symptoms: state.symptoms,
          tags: state.tags,
          env: state.env,
          baseline,
        });
        dispatch({ type: "retrieve_success", bundle: next });
      }
    } catch (e: any) {
      dispatch({ type: "event", event: { type: "error", message: e?.message ?? String(e) } });
    } finally {
      window.removeEventListener("keydown", onKey);
    }
  };

  const onFeedback = async (memoryId: string, useful: boolean) => {
    if (!state.contextBundle?.sessionId) {
      console.warn("No sessionId available for feedback");
      return;
    }

    try {
      // Submit feedback to update the weights in Neo4j
      await api.submitFeedback({
        agentId: "auggie",
        sessionId: state.contextBundle.sessionId,
        usedIds: [memoryId],
        usefulIds: useful ? [memoryId] : [],
        notUsefulIds: useful ? [] : [memoryId],
      });

      // Re-retrieve WITHOUT baseline to get fresh relevance scores with updated weights
      // This allows the retrieval algorithm to re-rank memories based on the new association strengths
      const next = await api.retrieveMemory({
        agentId: "auggie",
        prompt: state.prompt,
        symptoms: state.symptoms,
        tags: state.tags,
        env: state.env,
        // No baseline - we want fresh scores, not deltas
      });
      dispatch({ type: "retrieve_success", bundle: next });
    } catch (e: any) {
      console.error("Feedback failed:", e);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="h1">Agent Memory Demo</h1>
          <p className="sub">
            Best-practice prompt runner for React 19 + TypeScript 5+. Explicit actions (no auto-run), accessible chip inputs,
            and streaming progress focused on memory tools. Press <span className="kbd">Esc</span> to cancel.
          </p>
        </div>
        <div className="row">
          <span className="badge">API: /agent/run</span>
          <span className={`badge ${running ? "badgeWarn" : "badgeOk"}`}>{running ? "Running" : "Ready"}</span>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="cardHeader">
            <p className="cardTitle">Prompt</p>
            <div className="row">
              <button className="btn" type="button" onClick={() => dispatch({ type: "reset" })} disabled={busy}>
                Reset
              </button>
              <button
                className="btn"
                type="button"
                onClick={onRetrieve}
                disabled={busy || state.prompt.trim().length < 10}
              >
                {retrieving ? "Retrieving..." : "Retrieve"}
              </button>
              <button
                className="btn btnPrimary"
                type="button"
                onClick={onRun}
                disabled={running || state.prompt.trim().length < 10}
              >
                Run agent
              </button>
            </div>
          </div>

          <div className="cardBody">
            <p className="label">Task prompt</p>
            <textarea
              className="textarea"
              value={state.prompt}
              onChange={(e) => dispatch({ type: "set_prompt", prompt: e.target.value })}
              placeholder="Describe the task, include any errors/log lines."
              aria-label="Prompt"
            />

            <div className="divider" />

            <ChipInput
              label="Tags"
              value={state.tags}
              onChange={(tags) => dispatch({ type: "set_tags", tags })}
              placeholder="Add a tag and press Enter"
              helper={
                <>
                  Use tags to bias memory retrieval. Example: <span className="mono">react19</span>,{" "}
                  <span className="mono">typescript5</span>, <span className="mono">ux</span>.
                </>
              }
            />

            <div style={{ height: 12 }} />

            <ChipInput
              label="Symptoms / error strings"
              value={state.symptoms}
              onChange={(symptoms) => dispatch({ type: "set_symptoms", symptoms })}
              placeholder="Add a symptom and press Enter"
              helper={
                <>
                  Used for case-based matching (e.g. <span className="mono">EACCES</span>,{" "}
                  <span className="mono">ENOSPC</span>).
                </>
              }
            />

            <div className="divider" />

            <div className="row" style={{ alignItems: "flex-end" }}>
              <SelectField<OS>
                label="OS"
                value={(state.env.os ?? "macos") as OS}
                options={osOptions as any}
                onChange={(os) => dispatch({ type: "set_env", env: mergeEnv(state.env, { os }) })}
              />
              <SelectField<PM>
                label="Package manager"
                value={(state.env.packageManager ?? "npm") as PM}
                options={pmOptions as any}
                onChange={(packageManager) => dispatch({ type: "set_env", env: mergeEnv(state.env, { packageManager }) })}
              />
              <Toggle
                label="Container"
                checked={Boolean(state.env.container)}
                onChange={(container) => dispatch({ type: "set_env", env: mergeEnv(state.env, { container }) })}
              />
              <span className="pill" aria-hidden="true">
                <span className="mono">Principle:</span> one obvious primary action
              </span>
            </div>

            <div className="divider" />

            <p className="cardTitle" style={{ marginBottom: 10 }}>Context Preview</p>
            <ContextPreview bundle={state.contextBundle} retrieving={retrieving} queryTags={state.tags} onFeedback={onFeedback} />

            {state.error ? (
              <div className="toast" role="alert" aria-live="polite">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong style={{ color: "var(--danger)" }}>Error</strong>
                  <button className="btn btnDanger" type="button" onClick={() => dispatch({ type: "dismiss_error" })}>
                    Dismiss
                  </button>
                </div>
                <div className="small" style={{ marginTop: 8 }}>{state.error}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <p className="cardTitle">Agent progress</p>
            <span className="badge">NDJSON stream</span>
          </div>
          <div className="cardBody">
            <StreamLog events={state.events} />
            <div className="divider" />
            <p className="cardTitle" style={{ marginBottom: 10 }}>Answer</p>
            <AnswerPanel answer={state.answer} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }} className="small">
        Tip: click "Retrieve" to preview context. After running the agent, retrieval is repeated with a baseline so you can see learning deltas (Δμ) on each memory.
      </div>
    </div>
  );
}
