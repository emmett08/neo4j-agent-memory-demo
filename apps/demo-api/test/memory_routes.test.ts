import test from "node:test";
import assert from "node:assert/strict";
import { listSchema, listBaseSchema, filterPatterns } from "../src/memory_routes.js";

test("listBaseSchema accepts agentId/limit", () => {
  const res = listBaseSchema.parse({ agentId: "agent-1", limit: 50 });
  assert.equal(res.agentId, "agent-1");
  assert.equal(res.limit, 50);
});

test("listSchema enforces kind", () => {
  const res = listSchema.parse({ kind: "semantic" });
  assert.equal(res.kind, "semantic");
  const bad = listSchema.safeParse({ kind: "unknown" });
  assert.equal(bad.success, false);
});

test("filterPatterns returns tagged memories", () => {
  const items = [
    { id: "1", kind: "semantic", polarity: "positive", title: "A", tags: ["pattern"], confidence: 0.7, utility: 0.2 },
    { id: "2", kind: "semantic", polarity: "positive", title: "B", tags: [], confidence: 0.7, utility: 0.2 },
  ];
  const out = filterPatterns(items as any);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "1");
});
