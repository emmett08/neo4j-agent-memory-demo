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
    /CALL\s*\(\s*kind\s*,\s*agentId\s*\)\s*\{/s.test(cypher),
    "expected variable scope import for subquery",
  );

  assert.ok(
    /WITH\s+kind\s*,\s*agentId\s+WHERE\s+agentId\s+IS\s+NOT\s+NULL\s+AND\s+agentId\s+<>\s+""/s.test(cypher),
    "expected agent-filter branch to filter on non-importing WITH",
  );

  assert.ok(
    /WITH\s+kind\s*,\s*agentId\s+WHERE\s+agentId\s+IS\s+NULL\s+OR\s+agentId\s*=\s*""/s.test(cypher),
    "expected no-agent branch to filter on non-importing WITH",
  );

  assert.ok(
    cypher.includes("WITH m, limit"),
    "expected limit to stay in scope after the subquery",
  );
});
