import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("publish workflow includes npmjs publish step", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const workflowPath = path.resolve(here, "../../../.github/workflows/publish-neo4j-agent-memory.yml");
  const workflow = readFileSync(workflowPath, "utf8");

  assert.match(workflow, /registry\.npmjs\.org/);
  assert.match(workflow, /npm whoami --registry https:\/\/npm\.pkg\.github\.com/);
  assert.match(workflow, /npm config set \/\/npm\.pkg\.github\.com\/:_authToken=/);
  assert.match(workflow, /npm publish -w packages\/neo4j-agent-memory --access public/);
});
