import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicaliseForHash, sha256Hex } from "../dist/index.js";

test("hash canonicalisation stable", () => {
  const a = sha256Hex(canonicaliseForHash("Title", "Hello   world", ["NPM", "node_modules"]));
  const b = sha256Hex(canonicaliseForHash(" title ", "hello world", ["node_modules", "npm"]));
  assert.equal(a, b);
});

test("cypher assets are bundled in dist", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cypherDir = path.resolve(here, "../dist/cypher");
  const files = [
    "schema.cypher",
    "upsert_memory.cypher",
    "upsert_case.cypher",
    "retrieve_context_bundle.cypher",
    "feedback_batch.cypher",
    "feedback_co_used_with_batch.cypher",
    "list_memories.cypher",
    "relate_concepts.cypher",
    "auto_relate_memory_by_tags.cypher",
    "get_memories_by_id.cypher",
    "get_memory_graph.cypher",
    "fallback_retrieve_memories.cypher",
    "list_memory_edges.cypher",
  ];

  for (const name of files) {
    const p = path.join(cypherDir, name);
    assert.ok(existsSync(p), `missing cypher asset: ${p}`);
  }
});
