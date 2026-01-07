import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvText, parsePipeList } from "../src/utils/csv.js";

test("parseCsvText supports comments and quotes", () => {
  const rows = parseCsvText(
    [
      "# comment",
      "id,title,json",
      '1,Hello,"{""ok"":true}"',
      '2,"Quoted title","[""a"",""b""]"',
    ].join("\n")
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "1");
  assert.equal(rows[0].title, "Hello");
  assert.equal(rows[0].json, "{\"ok\":true}");
  assert.equal(rows[1].title, "Quoted title");
});

test("parsePipeList splits and trims", () => {
  assert.deepEqual(parsePipeList("a| b |c||"), ["a", "b", "c"]);
});

test("seed CSV files contain enough rows", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const seedDir = path.resolve(here, "..", "seed");

  const memories = parseCsvText(readFileSync(path.join(seedDir, "memories.csv"), "utf8"));
  const cases = parseCsvText(readFileSync(path.join(seedDir, "cases.csv"), "utf8"));
  const relations = parseCsvText(readFileSync(path.join(seedDir, "concept_relations.csv"), "utf8"));

  assert.ok(memories.length >= 20, `expected >=20 memories, got ${memories.length}`);
  assert.ok(cases.length >= 20, `expected >=20 cases, got ${cases.length}`);
  assert.ok(relations.length >= 10, `expected >=10 relations, got ${relations.length}`);
});

test("seed contains npm EACCES memory that matches search_memories example filters", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const seedDir = path.resolve(here, "..", "seed");
  const memories = parseCsvText(readFileSync(path.join(seedDir, "memories.csv"), "utf8"));

  const row = memories.find((r) => r.id === "mem_fix_npm_eacces_macos");
  assert.ok(row, "expected mem_fix_npm_eacces_macos seed row");
  assert.equal(row.kind, "procedural");

  const tags = parsePipeList(row.tags ?? "");
  assert.ok(tags.includes("npm"), "expected tag: npm");

  const fulltext = `${row.title ?? ""} ${row.summary ?? ""} ${row.content ?? ""}`;
  assert.match(fulltext, /eacces/i);
  assert.match(fulltext, /node_modules/i);

  assert.equal(row.scopeRuntime, "node");
  assert.ok(parsePipeList(row.scopeVersions ?? "").includes("20"), "expected scopeVersions includes 20");
});
