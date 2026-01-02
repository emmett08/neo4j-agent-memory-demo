import test from "node:test";
import assert from "node:assert/strict";
import { mean, evidence, variance, approxCI95Range, certaintyFromEvidence } from "../src/ui/viz/influenceMath.js";

test("mean is a/(a+b)", () => {
  assert.equal(mean({ a: 1, b: 1 }), 0.5);
  assert.equal(mean({ a: 3, b: 1 }), 0.75);
});

test("evidence is a+b", () => {
  assert.equal(evidence({ a: 1.25, b: 2.75 }), 4.0);
});

test("variance decreases with more evidence (holding mean roughly constant)", () => {
  const v1 = variance({ a: 1, b: 1 });   // n=2
  const v2 = variance({ a: 10, b: 10 }); // n=20
  assert.ok(v2 < v1);
});

test("approxCI95Range produces a bounded range within [0,1]", () => {
  const r = approxCI95Range({ a: 1, b: 1 });
  assert.ok(r.lo >= 0 && r.hi <= 1);
  assert.ok(r.width >= 0 && r.width <= 1);
});

test("certaintyFromEvidence saturates towards 1 and is 0 at n=0", () => {
  assert.equal(certaintyFromEvidence(0, 12), 0);
  assert.ok(certaintyFromEvidence(12, 12) > 0.60);
  assert.ok(certaintyFromEvidence(100, 12) > 0.99);
});
