import type { AgentStreamEvent, EnvironmentFingerprint, ContextBundle } from "../domain/types";

export type RequestState = "idle" | "retrieving" | "retrieved" | "running" | "error" | "done";

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
    case "reset":
      return { ...initialState, prompt: state.prompt };
    case "dismiss_error":
      return { ...state, error: null };
    default:
      return state;
  }
}
