import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureWorkspaceLinks } from "../../../scripts/ensure-workspace-links.mjs";

const PACKAGE_NAME = "@neuralsea/neo4j-agent-memory";
const PACKAGE_DIR = "packages/neo4j-agent-memory";
const PACKAGE_JSON = "package.json";
const SCOPED_PACKAGE_DIR = path.join("node_modules", "@neuralsea", "neo4j-agent-memory");

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

function writePackageJson(dirPath, name) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(
    path.join(dirPath, PACKAGE_JSON),
    JSON.stringify({ name }, null, 2),
    "utf8"
  );
}

test("unit: links workspace package when missing", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neo4j-agent-memory-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  writePackageJson(path.join(tempRoot, PACKAGE_DIR), PACKAGE_NAME);

  const result = ensureWorkspaceLinks({ repoRoot: tempRoot, logger: silentLogger });
  assert.equal(result.action, "linked");

  const scopedLinkPath = path.join(tempRoot, SCOPED_PACKAGE_DIR);
  assert.ok(fs.existsSync(scopedLinkPath));
  const resolvedPath = fs.realpathSync(scopedLinkPath);
  const expectedPath = fs.realpathSync(path.join(tempRoot, PACKAGE_DIR));
  assert.equal(resolvedPath, expectedPath);
});

test("integration: accepts existing scoped package directory", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neo4j-agent-memory-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  writePackageJson(path.join(tempRoot, PACKAGE_DIR), PACKAGE_NAME);
  writePackageJson(path.join(tempRoot, SCOPED_PACKAGE_DIR), PACKAGE_NAME);

  const result = ensureWorkspaceLinks({ repoRoot: tempRoot, logger: silentLogger });
  assert.equal(result.action, "none");
});

test("unit: throws when workspace package is missing", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neo4j-agent-memory-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  assert.throws(
    () => ensureWorkspaceLinks({ repoRoot: tempRoot, logger: silentLogger }),
    /Workspace package not found/
  );
});

test("smoke: workspace package resolves after linking", async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  ensureWorkspaceLinks({ repoRoot, logger: silentLogger });

  const pkg = await import("@neuralsea/neo4j-agent-memory");
  assert.equal(typeof pkg.createMemoryService, "function");
});
