import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("list_memories.cypher avoids importing WITH + WHERE", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cypherDir = path.resolve(here, "../dist/cypher");
  const cypher = readFileSync(path.join(cypherDir, "list_memories.cypher"), "utf8");

  assert.ok(
    cypher.includes('WITH kind, agentId WHERE agentId IS NOT NULL AND agentId <> ""'),
    "expected agent-filter branch to filter on non-importing WITH",
  );

  assert.ok(
    cypher.includes('WITH kind, agentId WHERE agentId IS NULL OR agentId = ""'),
    "expected no-agent branch to filter on non-importing WITH",
  );

  assert.ok(
    cypher.includes("WITH m, limit"),
    "expected limit to stay in scope after the subquery",
  );
});
