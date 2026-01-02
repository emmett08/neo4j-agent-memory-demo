import type {
  AgentStreamEvent,
  EnvironmentFingerprint,
  ContextBundle,
  MemorySummary,
} from "../domain/types.js";

export type RequestState = "idle" | "retrieving" | "retrieved" | "running" | "error" | "done";
export type StoredState = "idle" | "loading" | "error" | "ready";
export type ViewMode = "run" | "stored";
export type StoredKind = "all" | "skills" | "concepts" | "episodes" | "patterns";

export interface AppState {
  prompt: string;
  tags: string[];
  symptoms: string[];
  env: EnvironmentFingerprint;

  status: RequestState;
  contextBundle: ContextBundle | null;
  events: AgentStreamEvent[];
  answer: string | null;
  error: string | null;

  view: ViewMode;
  storedKind: StoredKind;
  storedItems: MemorySummary[];
  storedStatus: StoredState;
  storedError: string | null;
}

export type AppAction =
  | { type: "set_prompt"; prompt: string }
  | { type: "set_tags"; tags: string[] }
  | { type: "set_symptoms"; symptoms: string[] }
  | { type: "set_env"; env: EnvironmentFingerprint }
  | { type: "retrieve_start" }
  | { type: "retrieve_success"; bundle: ContextBundle }
  | { type: "retrieve_error"; error: string }
  | { type: "start" }
  | { type: "event"; event: AgentStreamEvent }
  | { type: "set_view"; view: ViewMode }
  | { type: "set_stored_kind"; kind: StoredKind }
  | { type: "stored_start" }
  | { type: "stored_success"; items: MemorySummary[] }
  | { type: "stored_error"; error: string }
  | { type: "reset" }
  | { type: "dismiss_error" };

export const initialState: AppState = {
  prompt: "I'm getting 'EACCES: permission denied' when running npm install on my Mac. The error says it cannot create node_modules directory. I haven't used sudo. How do I fix this?",
  tags: ["npm", "macos", "troubleshooting"],
  symptoms: ["EACCES", "permission denied", "node_modules"],
  env: { os: "macos", packageManager: "npm", container: false },
  status: "idle",
  contextBundle: null,
  events: [],
  answer: null,
  error: null,
  view: "run",
  storedKind: "all",
  storedItems: [],
  storedStatus: "idle",
  storedError: null,
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "set_prompt":
      return { ...state, prompt: action.prompt };
    case "set_tags":
      return { ...state, tags: action.tags };
    case "set_symptoms":
      return { ...state, symptoms: action.symptoms };
    case "set_env":
      return { ...state, env: action.env };
    case "retrieve_start":
      return { ...state, status: "retrieving", error: null };
    case "retrieve_success":
      return { ...state, status: "retrieved", contextBundle: action.bundle, error: null };
    case "retrieve_error":
      return { ...state, status: "error", error: action.error };
    case "start":
      return { ...state, status: "running", events: [], answer: null, error: null };
    case "event": {
      const nextEvents = [...state.events, action.event];
      if (action.event.type === "final") {
        return { ...state, status: "done", events: nextEvents, answer: action.event.answer };
      }
      if (action.event.type === "error") {
        return { ...state, status: "error", events: nextEvents, error: action.event.message };
      }
      return { ...state, events: nextEvents };
    }
    case "set_view":
      return { ...state, view: action.view };
    case "set_stored_kind":
      return { ...state, storedKind: action.kind };
    case "stored_start":
      return { ...state, storedStatus: "loading", storedError: null };
    case "stored_success":
      return { ...state, storedStatus: "ready", storedItems: action.items, storedError: null };
    case "stored_error":
      return { ...state, storedStatus: "error", storedError: action.error };
    case "reset":
      return { ...initialState, prompt: state.prompt };
    case "dismiss_error":
      return { ...state, error: null };
    default:
      return state;
  }
}
