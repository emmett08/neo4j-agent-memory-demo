import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("publish workflow includes npmjs publish step", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const workflowPath = path.resolve(here, "../../../.github/workflows/publish-neo4j-agent-memory.yml");
  const workflow = readFileSync(workflowPath, "utf8").replace(/\r\n/g, "\n");
  const publishMatch = workflow.match(/\n  publish:\n([\s\S]*?)(?=\n  \w|\n$)/);

  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["CI"\]/);
  assert.match(workflow, /actions:\s*read/);
  assert.match(workflow, /registry\.npmjs\.org/);
  assert.match(workflow, /git tag --points-at/);
  assert.match(workflow, /gh api \/repos\/\$\{\{ github\.repository \}\}\/actions\/runs/);
  assert.match(workflow, /npm whoami --registry https:\/\/npm\.pkg\.github\.com/);
  assert.match(workflow, /npm config set \/\/npm\.pkg\.github\.com\/:_authToken=/);
  assert.match(workflow, /download-artifact@v4/);
  assert.match(workflow, /npm publish -w packages\/neo4j-agent-memory --ignore-scripts/);
  assert.match(workflow, /npm publish -w packages\/neo4j-agent-memory --access public --registry https:\/\/registry\.npmjs\.org --ignore-scripts/);
  assert.ok(publishMatch, "missing publish job definition");
  assert.match(publishMatch[0], /runs-on: ubuntu-latest/);
  assert.match(publishMatch[0], /node-version: "20\.x"/);
  assert.ok(!publishMatch[0].includes("strategy:"), "publish job should not use a matrix");
});
