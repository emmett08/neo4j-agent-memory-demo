export type MemoryKind = "semantic" | "procedural" | "episodic";
export type MemoryPolarity = "positive" | "negative";
export type MemoryOutcome = "success" | "partial" | "dead_end";

export interface MemoryScope {
  repo?: string;
  package?: string;
  module?: string;
  runtime?: string;
  versions?: string[];
}

export interface EnvironmentFingerprint {
  hash?: string; // optional; service will compute if absent
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

export interface DistilledInvariant {
  invariant: string;
  justification?: string;
  verification?: string[];
  applicability?: string[];
  risks?: string[];
}

export interface MemoryTriage {
  symptoms: string[];
  likelyCauses: string[];
  verificationSteps?: string[];
  fixSteps?: string[];
  gotchas?: string[];
}

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  polarity: MemoryPolarity;
  title: string;
  content: string;              // canonical plain text
  summary?: string;             // 1-3 sentences
  whenToUse?: string[];         // concrete triggers (symptoms/env/versions)
  howToApply?: string[];        // steps/commands/files/symbols
  gotchas?: string[];           // dead ends / failure modes
  scope?: MemoryScope;          // applicability boundaries
  evidence?: string[];          // minimal logs/links/hashes
  outcome?: MemoryOutcome;      // success/partial/dead_end
  validFrom?: string;           // ISO string
  validTo?: string;             // ISO string
  tags: string[];
  confidence: number;           // 0..1
  utility: number;              // 0..1
  createdAt?: string;
  updatedAt?: string;

  triage?: MemoryTriage;

  signals?: {
    symptoms?: string[];
    environment?: string[];
  };

  distilled?: {
    invariants?: DistilledInvariant[];
    steps?: string[];
    verificationSteps?: string[];
    gotchas?: string[];
  };

  antiPattern?: {
    action: string;
    whyBad: string;
    saferAlternative?: string;
  };

  env?: EnvironmentFingerprint; // optional applicability
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

export interface MemoryGraphEdge {
  source: string;
  target: string;
  kind: "recalls" | "co_used_with" | "related_to";
  strength: number;
  evidence: number;
  updatedAt?: string | null;
}

export interface MemoryGraphResponse {
  nodes: MemoryRecord[];
  edges: MemoryGraphEdge[];
}

export interface KnowledgeGraphQuery {
  id: string;
  tags: string[];
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  kind: "tag_match" | "co_used_with" | "related_to";
  /** Strength in [0..1] (tag overlap for tag_match; posterior mean for co_used_with; weight for related_to) */
  strength: number;
  /** Evidence mass (matched tag count for tag_match; a+b for co_used_with; 1.0 for related_to) */
  evidence: number;
  matchedTags?: string[];
}

export interface KnowledgeGraphResponse {
  query: KnowledgeGraphQuery;
  nodes: MemoryRecord[];
  edges: KnowledgeGraphEdge[];
}

export interface CaseRecord {
  id: string;
  title: string;
  summary: string;
  outcome: "resolved" | "unresolved" | "workaround";
  symptoms: string[];
  env: EnvironmentFingerprint;
  resolvedByMemoryIds: string[];
  negativeMemoryIds: string[];
  resolvedAtIso?: string | null;
}

export interface RetrieveContextArgs {
  agentId: string;
  prompt: string;
  symptoms?: string[];
  tags?: string[];
  kinds?: MemoryKind[]; // optional filter for memories (fix section still prefers semantic/procedural)
  env?: EnvironmentFingerprint;
  baseline?: Record<string, { a: number; b: number }>;
  caseLimit?: number;
  fixLimit?: number;
  dontLimit?: number;
  nowIso?: string;
  fallback?: {
    enabled?: boolean;
    limit?: number;
    useFulltext?: boolean;
    useVector?: boolean;
    useTags?: boolean;
    embedding?: number[];
  };
}

export interface ListMemoriesArgs {
  kind?: MemoryKind;
  limit?: number;
  agentId?: string;
}

export interface GetMemoriesByIdArgs {
  ids: string[];
}

export interface GetMemoryGraphArgs {
  agentId?: string;
  memoryIds: string[];
  includeNodes?: boolean;
  includeRelatedTo?: boolean;
}

export interface GetKnowledgeGraphByTagsArgs {
  tags: string[];
  limit?: number;
  minStrength?: number;
  includeNodes?: boolean;
}

export interface BetaEdge {
  a: number;
  b: number;
  /** Posterior mean a/(a+b), cached for query speed */
  strength: number;
  /** Evidence mass a+b, cached for query speed */
  evidence: number;
  updatedAt: string | null;
}

export type ContextMemoryBase = Pick<
  MemoryRecord,
  "id" | "kind" | "polarity" | "title" | "content" | "tags" | "confidence" | "utility" | "updatedAt"
>;

export type ContextMemorySummary = ContextMemoryBase & {
  /** Posterior snapshot before the current run (baseline) */
  edgeBefore?: BetaEdge;
  /** Posterior snapshot after the current run (undefined until feedback arrives) */
  edgeAfter?: BetaEdge;
};

export interface ContextBundle {
  sessionId: string;
  sections: {
    fix: ContextMemorySummary[];
    doNotDo: ContextMemorySummary[];
  };
  injection: {
    fixBlock: string;
    doNotDoBlock: string;
  };
}

export interface FeedbackMetrics {
  durationMs?: number;
  quality?: number;
  hallucinationRisk?: number;
  toolCalls?: number;
  verificationPassed?: boolean;
}

export interface MemoryFeedback {
  agentId: string;
  sessionId: string;
  usedIds: string[];
  usefulIds: string[];
  notUsefulIds: string[];
  neutralIds?: string[];
  updateUnratedUsed?: boolean;
  preventedErrorIds?: string[]; // negative memories that prevented mistakes
  metrics?: FeedbackMetrics;
  notes?: string;
}

export interface MemoryFeedbackResult {
  updated: Array<{ id: string; edge: BetaEdge }>;
}

export interface ListMemoryEdgesArgs {
  limit?: number;
  minStrength?: number;
}

export interface MemoryEdgeExport {
  source: string;
  target: string;
  kind: "co_used_with" | "related_to";
  strength: number;
  evidence: number;
  updatedAt?: string | null;
}

export interface RetrieveContextBundleWithGraphArgs extends RetrieveContextArgs {
  includeNodes?: boolean;
  includeRelatedTo?: boolean;
}

export interface ContextBundleWithGraph {
  bundle: ContextBundle;
  graph: MemoryGraphResponse;
}

export interface CaptureUsefulLearningArgs {
  agentId: string;
  sessionId?: string;
  useful?: boolean;
  learning: LearningCandidate & { utility?: number };
}

export interface CaptureEpisodeArgs {
  agentId: string;
  runId: string;
  workflowName: string;
  prompt: string;
  response: string;
  outcome?: "success" | "failure" | "partial" | "unknown";
  tags?: string[];
}

export interface CaptureStepEpisodeArgs extends CaptureEpisodeArgs {
  stepName: string;
}

export interface MemoryEvent {
  type: "read" | "write";
  action: string;
  at: string;
  meta?: Record<string, unknown>;
}

export interface LearningCandidate {
  kind: MemoryKind;
  polarity?: MemoryPolarity; // default positive
  title: string;
  content: string;
  summary?: string;
  whenToUse?: string[];
  howToApply?: string[];
  gotchas?: string[];
  scope?: MemoryScope;
  evidence?: string[];
  outcome?: MemoryOutcome;
  validFromIso?: string | null;
  validToIso?: string | null;
  contentHash?: string;
  tags: string[];
  confidence: number; // 0..1
  utility?: number; // 0..1 optional override
  signals?: MemoryRecord["signals"];
  distilled?: MemoryRecord["distilled"];
  concepts?: string[];
  filePaths?: string[];
  toolNames?: string[];
  errorSignatures?: string[];
  env?: EnvironmentFingerprint;
  triage?: MemoryTriage;
  antiPattern?: MemoryRecord["antiPattern"];
}

export interface SaveLearningRequest {
  agentId: string;
  sessionId?: string;
  taskId?: string;
  learnings: LearningCandidate[];
  policy?: {
    minConfidence?: number;
    requireVerificationSteps?: boolean;
    maxItems?: number;
  };
}

export interface SaveLearningResult {
  saved: Array<{ id: string; kind: MemoryKind; title: string; deduped: boolean }>;
  rejected: Array<{ title: string; reason: string }>;
}

export interface AutoRelateConfig {
  enabled?: boolean;
  minSharedTags?: number;
  minWeight?: number;
  maxCandidates?: number;
  sameKind?: boolean;
  samePolarity?: boolean;
  allowedKinds?: MemoryKind[];
}

export interface MemoryServiceConfig {
  neo4j: { uri: string; username: string; password: string; database?: string };
  vectorIndex?: string;   // default memoryEmbedding
  fulltextIndex?: string; // default memoryText
  halfLifeSeconds?: number; // default 30 days
  autoRelate?: AutoRelateConfig;
  onMemoryEvent?: (event: MemoryEvent) => void;
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

export type MemoryToolName =
  | "store_skill"
  | "store_pattern"
  | "store_concept"
  | "relate_concepts"
  | "recall_skills"
  | "recall_concepts"
  | "recall_patterns";

export interface MemoryToolDefinition<TInput, TResult> {
  name: MemoryToolName;
  description: string;
  inputSchema?: unknown;
  execute: (input: TInput) => Promise<TResult>;
}

export type MemoryToolSet = Record<MemoryToolName, MemoryToolDefinition<any, any>>;

export interface SearchMemoriesArgs {
  query: string;
  tags?: string[];
  kind?: MemoryKind;
  outcome?: MemoryOutcome;
  scope?: MemoryScope;
  topK?: number;
}

export interface SearchMemorySummary extends MemorySummary {
  score: number;
}
