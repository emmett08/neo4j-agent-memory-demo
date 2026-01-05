import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

declare const __dirname: string | undefined;

const resolvedDir = typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.basename(resolvedDir) === "cypher" ? resolvedDir : path.resolve(resolvedDir, "cypher");

export function loadCypher(rel: string): string {
  return readFileSync(path.resolve(baseDir, rel), "utf8");
}

export const cypher = {
  schema: loadCypher("schema.cypher"),
  upsertMemory: loadCypher("upsert_memory.cypher"),
  upsertCase: loadCypher("upsert_case.cypher"),
  retrieveContextBundle: loadCypher("retrieve_context_bundle.cypher"),
  feedbackBatch: loadCypher("feedback_batch.cypher"),
  feedbackCoUsed: loadCypher("feedback_co_used_with_batch.cypher"),
  listMemories: loadCypher("list_memories.cypher"),
  relateConcepts: loadCypher("relate_concepts.cypher"),
  autoRelateByTags: loadCypher("auto_relate_memory_by_tags.cypher"),
  getMemoriesById: loadCypher("get_memories_by_id.cypher"),
  getMemoryGraph: loadCypher("get_memory_graph.cypher"),
  fallbackRetrieveMemories: loadCypher("fallback_retrieve_memories.cypher"),
  listMemoryEdges: loadCypher("list_memory_edges.cypher"),
};
