import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("publish workflow includes npmjs publish step", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const workflowPath = path.resolve(here, "../../../.github/workflows/ci-release.yml");
  const workflow = readFileSync(workflowPath, "utf8").replace(/\r\n/g, "\n");
  const publishMatch = workflow.match(/\n  publish:\n([\s\S]*?)(?=\n  \w|\n$)/);

  assert.match(workflow, /name: CI & Release/);
  assert.match(workflow, /Validate tag matches package version/);
  assert.match(workflow, /registry\.npmjs\.org/);
  assert.match(workflow, /npm pack -w packages\/neo4j-agent-memory/);
  assert.match(workflow, /npm publish \"\$\{\{ steps\.pack\.outputs\.tarball \}\}\"/);
  assert.match(workflow, /--registry \"https:\/\/npm\.pkg\.github\.com\"/);
  assert.match(workflow, /--registry \"https:\/\/registry\.npmjs\.org\"/);
  assert.match(workflow, /--access public/);
  assert.ok(publishMatch, "missing publish job definition");
  assert.match(publishMatch[0], /runs-on: ubuntu-latest/);
  assert.match(publishMatch[0], /node-version: "20\.x"/);
  assert.ok(!publishMatch[0].includes("strategy:"), "publish job should not use a matrix");
});
