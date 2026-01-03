import { z } from "zod/v3";
import type { MemorySummary } from "neo4j-agent-memory";

export const listBaseSchema = z.object({
  agentId: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const listSchema = listBaseSchema.extend({
  kind: z.enum(["semantic", "procedural", "episodic"]).optional(),
});

export function filterPatterns(items: MemorySummary[]): MemorySummary[] {
  return items.filter((m) => (m.tags ?? []).includes("pattern"));
}
