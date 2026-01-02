import type {
  AgentStreamEvent,
  EnvironmentFingerprint,
  ContextBundle,
  MemoryKind,
  MemorySummary,
} from "../domain/types";

export interface RunAgentRequest {
  agentId: string;
  prompt: string;
  symptoms?: string[];
  tags?: string[];
  env?: EnvironmentFingerprint;
}

export interface RetrieveMemoryRequest {
  agentId: string;
  prompt: string;
  symptoms?: string[];
  tags?: string[];
  env?: EnvironmentFingerprint;
  baseline?: Record<string, { a: number; b: number }>;
  caseLimit?: number;
  fixLimit?: number;
  dontLimit?: number;
}

export interface SubmitFeedbackRequest {
  agentId: string;
  sessionId: string;
  usedIds?: string[];
  usefulIds?: string[];
  notUsefulIds?: string[];
  preventedErrorIds?: string[];
}

export interface ListMemoriesRequest {
  agentId?: string;
  limit?: number;
  kind?: MemoryKind;
}

/**
 * ApiClient: single responsibility (HTTP + streaming parsing).
 * It parses NDJSON events from the demo API.
 */
export class ApiClient {
  constructor(private readonly baseUrl = "") {}

  async retrieveMemory(req: RetrieveMemoryRequest): Promise<ContextBundle> {
    const r = await fetch(`${this.baseUrl}/memory/retrieve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(err.error || `Retrieve failed: ${r.status}`);
    }
    return r.json();
  }

  async submitFeedback(req: SubmitFeedbackRequest): Promise<{ ok: boolean }> {
    const r = await fetch(`${this.baseUrl}/memory/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(err.error || `Feedback failed: ${r.status}`);
    }
    return r.json();
  }

  async listMemories(req: ListMemoriesRequest = {}): Promise<MemorySummary[]> {
    const r = await fetch(`${this.baseUrl}/memory/list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(err.error || `List failed: ${r.status}`);
    }
    const body = await r.json();
    return body.items ?? [];
  }

  async listSkills(req: Omit<ListMemoriesRequest, "kind"> = {}): Promise<MemorySummary[]> {
    const r = await fetch(`${this.baseUrl}/memory/skills`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(err.error || `List skills failed: ${r.status}`);
    }
    const body = await r.json();
    return body.items ?? [];
  }

  async listConcepts(req: Omit<ListMemoriesRequest, "kind"> = {}): Promise<MemorySummary[]> {
    const r = await fetch(`${this.baseUrl}/memory/concepts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(err.error || `List concepts failed: ${r.status}`);
    }
    const body = await r.json();
    return body.items ?? [];
  }

  async listEpisodes(req: Omit<ListMemoriesRequest, "kind"> = {}): Promise<MemorySummary[]> {
    const r = await fetch(`${this.baseUrl}/memory/episodes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(err.error || `List episodes failed: ${r.status}`);
    }
    const body = await r.json();
    return body.items ?? [];
  }

  async listPatterns(req: Omit<ListMemoriesRequest, "kind"> = {}): Promise<MemorySummary[]> {
    const r = await fetch(`${this.baseUrl}/memory/patterns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(err.error || `List patterns failed: ${r.status}`);
    }
    const body = await r.json();
    return body.items ?? [];
  }

  async runAgentStream(
    req: RunAgentRequest,
    onEvent: (ev: AgentStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const r = await fetch(`${this.baseUrl}/agent/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    if (!r.ok || !r.body) throw new Error(`Run failed: ${r.status}`);

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;

        try {
          onEvent(JSON.parse(line) as AgentStreamEvent);
        } catch {
          // ignore malformed line
        }
      }
    }
  }
}
