import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("publishConfig defaults to npmjs", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(here, "../package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

  assert.equal(pkg.publishConfig?.registry, "https://registry.npmjs.org");
});
