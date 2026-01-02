export interface EnvironmentFingerprint {
  os?: "macos" | "linux" | "windows";
  distro?: string;
  ci?: string;
  container?: boolean;
  filesystem?: string;
  workspaceMount?: "local" | "network" | "bind" | "readonly";
  nodeVersion?: string;
  packageManager?: "npm" | "pnpm" | "yarn";
  pmVersion?: string;
}

export type MemoryKind = "semantic" | "procedural" | "episodic";
export type MemoryPolarity = "positive" | "negative";

export interface BetaEdge {
  a: number;
  b: number;
  strength: number;
  evidence: number;
  updatedAt?: string | null;
}

export interface Memory {
  id: string;
  kind: MemoryKind;
  polarity: MemoryPolarity;
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  utility: number;
  updatedAt: string;
  edgeBefore?: BetaEdge;
  edgeAfter?: BetaEdge;
}

export interface MemorySummary {
  id: string;
  kind: MemoryKind;
  polarity: MemoryPolarity;
  title: string;
  tags: string[];
  confidence: number;
  utility: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ContextBundle {
  sessionId: string;
  sections: {
    fix: Memory[];
    doNotDo: Memory[];
  };
  injection: {
    fixBlock: string;
    doNotDoBlock: string;
  };
}

export interface MemoryEvent {
  type: "read" | "write";
  action: string;
  at: string;
  meta?: Record<string, unknown>;
}

export type AgentStreamEvent =
  | { type: "tool_call"; title: string }
  | { type: "tool_call_update"; title: string }
  | { type: "final"; durationMs: number; answer: string }
  | { type: "memory_event"; event: MemoryEvent }
  | { type: "error"; message: string };
