import test from "node:test";
import assert from "node:assert/strict";
import { MemoryService } from "../dist/index.js";

const baseConfig = {
  neo4j: { uri: "bolt://localhost:7687", username: "neo4j", password: "test" },
};

test("listMemories maps summaries", async () => {
  const mem = new MemoryService(baseConfig);
  const calls = [];

  const session = {
    run: async (_query, params) => {
      calls.push(params);
      return {
        records: [
          {
            get: (key) => {
              if (key !== "memories") return undefined;
              return [
                {
                  id: "m1",
                  kind: "semantic",
                  polarity: "positive",
                  title: "Concept",
                  tags: ["tag"],
                  confidence: 0.9,
                  utility: 0.3,
                  createdAt: "2024-01-01T00:00:00Z",
                  updatedAt: "2024-01-02T00:00:00Z",
                },
              ];
            },
          },
        ],
      };
    },
    close: async () => {},
  };

  mem.client = { session: () => session };

  const res = await mem.listMemories({ kind: "semantic", limit: 10, agentId: "agent-1" });
  assert.equal(res.length, 1);
  assert.equal(res[0].id, "m1");
  assert.equal(res[0].kind, "semantic");
  assert.equal(calls[0].kind, "semantic");
  assert.equal(calls[0].limit, 10);
  assert.equal(calls[0].agentId, "agent-1");
});

test("captureEpisode formats episodic learning", async () => {
  const mem = new MemoryService(baseConfig);
  let captured = null;

  mem.saveLearnings = async (req) => {
    captured = req;
    return { saved: [], rejected: [] };
  };

  await mem.captureEpisode({
    agentId: "agent-2",
    runId: "run-9",
    workflowName: "triage",
    prompt: "What went wrong?",
    response: "We found missing permissions.",
    outcome: "success",
    tags: ["triage"],
  });

  assert.ok(captured);
  assert.equal(captured.agentId, "agent-2");
  assert.equal(captured.sessionId, "run-9");
  assert.equal(captured.learnings[0].kind, "episodic");
  assert.ok(captured.learnings[0].title.includes("triage"));
  assert.ok(captured.learnings[0].content.includes("Prompt:"));
  assert.ok(captured.learnings[0].content.includes("Response:"));
});

test("captureStepEpisode includes step name", async () => {
  const mem = new MemoryService(baseConfig);
  let captured = null;

  mem.saveLearnings = async (req) => {
    captured = req;
    return { saved: [], rejected: [] };
  };

  await mem.captureStepEpisode({
    agentId: "agent-3",
    runId: "run-10",
    workflowName: "triage",
    stepName: "fix",
    prompt: "Run the fix",
    response: "Applied chown",
    outcome: "success",
  });

  assert.ok(captured);
  assert.ok(captured.learnings[0].title.includes("fix"));
});
