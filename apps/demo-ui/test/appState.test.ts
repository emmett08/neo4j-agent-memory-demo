import test from "node:test";
import assert from "node:assert/strict";
import { initialState, reducer } from "../src/state/appState.js";

const baseState = { ...initialState };

test("set_view switches view", () => {
  const next = reducer(baseState, { type: "set_view", view: "stored" });
  assert.equal(next.view, "stored");
});

test("stored actions update list state", () => {
  let next = reducer(baseState, { type: "stored_start" });
  assert.equal(next.storedStatus, "loading");

  next = reducer(next, {
    type: "stored_success",
    items: [
      {
        id: "m1",
        kind: "semantic",
        polarity: "positive",
        title: "Test",
        tags: ["tag"],
        confidence: 0.7,
        utility: 0.2,
      },
    ],
  });
  assert.equal(next.storedStatus, "ready");
  assert.equal(next.storedItems.length, 1);

  next = reducer(next, { type: "stored_error", error: "failed" });
  assert.equal(next.storedStatus, "error");
  assert.equal(next.storedError, "failed");
});
