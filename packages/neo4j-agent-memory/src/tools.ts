import { z } from "zod";
import type {
  MemoryToolSet,
  MemoryToolDefinition,
  MemorySummary,
  LearningCandidate,
} from "./types.js";
import type { MemoryService } from "./memory_service.js";
import { compileMemoryFromRun } from "./memory_compiler.js";

const storeInputSchema = z.object({
  agentId: z.string(),
  title: z.string().min(4),
  content: z.string().min(20),
  summary: z.string().min(4).max(500).optional(),
  whenToUse: z.array(z.string()).optional(),
  howToApply: z.array(z.string()).optional(),
  gotchas: z.array(z.string()).optional(),
  scope: z.object({
    repo: z.string().optional(),
    package: z.string().optional(),
    module: z.string().optional(),
    runtime: z.string().optional(),
    versions: z.array(z.string()).optional(),
  }).optional(),
  evidence: z.array(z.string()).optional(),
  outcome: z.enum(["success", "partial", "dead_end"]).optional(),
  validFromIso: z.string().optional(),
  validToIso: z.string().optional(),
  tags: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1).optional(),
  env: z.record(z.string(), z.any()).optional(),
  triage: z.object({
    symptoms: z.array(z.string()).min(1),
    likelyCauses: z.array(z.string()).min(1),
    verificationSteps: z.array(z.string()).optional(),
    fixSteps: z.array(z.string()).optional(),
    gotchas: z.array(z.string()).optional(),
  }).optional(),
  antiPattern: z.object({
    action: z.string(),
    whyBad: z.string(),
    saferAlternative: z.string().optional(),
  }).optional(),
});

const recallInputSchema = z.object({
  agentId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const relateInputSchema = z.object({
  sourceId: z.string(),
  targetId: z.string(),
  weight: z.number().min(0).max(1).optional(),
});

function toLearning(kind: LearningCandidate["kind"], input: z.infer<typeof storeInputSchema>, extraTags: string[] = []): LearningCandidate {
  const tags = [...new Set([...(input.tags ?? []), ...extraTags])];
  const compiled = compileMemoryFromRun({
    agentId: input.agentId,
    kind,
    title: input.title,
    summary: input.summary ?? input.content.split("\n").filter(Boolean)[0]?.slice(0, 240) ?? "Stored memory.",
    whenToUse: input.whenToUse ?? [],
    howToApply: input.howToApply ?? [],
    gotchas: input.gotchas ?? [],
    evidence: input.evidence ?? [],
    scope: input.scope,
    tags,
    outcome: input.outcome ?? "success",
    confidence: input.confidence ?? 0.7,
  });
  return {
    ...compiled,
    content: input.content, // preserve caller-provided content verbatim
    validFromIso: input.validFromIso ?? null,
    validToIso: input.validToIso ?? null,
    env: input.env,
    triage: input.triage,
    antiPattern: input.antiPattern,
  };
}

export function createMemoryTools(service: MemoryService): MemoryToolSet {
  const storeBase = (kind: LearningCandidate["kind"], extraTags: string[] = []): MemoryToolDefinition<
    z.infer<typeof storeInputSchema>,
    { saved: Array<{ id: string; kind: string; title: string; deduped: boolean }>; rejected: Array<{ title: string; reason: string }> }
  > => ({
    name: "store_concept",
    description: "Store a memory item.",
    inputSchema: storeInputSchema,
    execute: async (input) => {
      const learning = toLearning(kind, input, extraTags);
      return service.saveLearnings({ agentId: input.agentId, learnings: [learning] });
    },
  });

  const recallBase = async (kind: "skills" | "concepts" | "patterns", input: z.infer<typeof recallInputSchema>): Promise<MemorySummary[]> => {
    if (kind === "skills") return service.listSkills({ agentId: input.agentId, limit: input.limit });
    if (kind === "concepts") return service.listConcepts({ agentId: input.agentId, limit: input.limit });
    const memories = await service.listConcepts({ agentId: input.agentId, limit: input.limit });
    return memories.filter((m) => m.tags.includes("pattern"));
  };

  return {
    store_skill: {
      ...storeBase("procedural"),
      name: "store_skill",
      description: "Store a procedural memory (skill).",
    },
    store_pattern: {
      ...storeBase("semantic", ["pattern"]),
      name: "store_pattern",
      description: "Store a semantic memory tagged as a pattern.",
    },
    store_concept: {
      ...storeBase("semantic"),
      name: "store_concept",
      description: "Store a semantic memory (concept).",
    },
    relate_concepts: {
      name: "relate_concepts",
      description: "Relate two concept memories with a weighted edge.",
      inputSchema: relateInputSchema,
      execute: async (input) => {
        await service.relateConcepts({
          sourceId: input.sourceId,
          targetId: input.targetId,
          weight: input.weight,
        });
        return { ok: true };
      },
    },
    recall_skills: {
      name: "recall_skills",
      description: "List stored skills (procedural memories).",
      inputSchema: recallInputSchema,
      execute: (input) => recallBase("skills", input),
    },
    recall_concepts: {
      name: "recall_concepts",
      description: "List stored concepts (semantic memories).",
      inputSchema: recallInputSchema,
      execute: (input) => recallBase("concepts", input),
    },
    recall_patterns: {
      name: "recall_patterns",
      description: "List stored patterns (semantic memories tagged 'pattern').",
      inputSchema: recallInputSchema,
      execute: (input) => recallBase("patterns", input),
    },
  };
}
