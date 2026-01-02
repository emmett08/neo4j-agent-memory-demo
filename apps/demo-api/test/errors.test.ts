import test from "node:test";
import assert from "node:assert/strict";
import { formatError } from "../src/utils/errors.js";

test("formatError handles Error instances", () => {
  const err = new Error("boom");
  const formatted = formatError(err);
  assert.ok(formatted.includes("boom"));
});

test("formatError handles string values", () => {
  assert.equal(formatError("oops"), "oops");
});

test("formatError handles objects", () => {
  assert.equal(formatError({ ok: true }), "{\"ok\":true}");
});
