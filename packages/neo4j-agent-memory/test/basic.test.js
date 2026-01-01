import test from "node:test";
import assert from "node:assert/strict";
import { canonicaliseForHash, sha256Hex } from "../dist/utils/hash.js";

test("hash canonicalisation stable", () => {
  const a = sha256Hex(canonicaliseForHash("Title", "Hello   world", ["NPM", "node_modules"]));
  const b = sha256Hex(canonicaliseForHash(" title ", "hello world", ["node_modules", "npm"]));
  assert.equal(a, b);
});
