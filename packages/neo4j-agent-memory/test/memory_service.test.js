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

test("upsertMemory auto-relates by tags when enabled", async () => {
  const mem = new MemoryService({
    ...baseConfig,
    autoRelate: {
      enabled: true,
      minSharedTags: 1,
      minWeight: 0.1,
      maxCandidates: 5,
      sameKind: false,
      samePolarity: false,
      allowedKinds: ["semantic"],
    },
  });
  const calls = [];
  const readSession = {
    run: async () => ({ records: [] }),
    close: async () => {},
  };
  const writeSession = {
    run: async (_query, params) => {
      calls.push(params);
      return { records: [] };
    },
    close: async () => {},
  };

  mem.client = {
    session: (mode) => (mode === "READ" ? readSession : writeSession),
  };

  await mem.upsertMemory({
    kind: "semantic",
    title: "Fix npm permissions",
    content: "Use chown on the npm cache and retry the install.",
    tags: ["npm", "permissions"],
    confidence: 0.9,
  });

  const relateCall = calls.find((params) => params?.minSharedTags === 1);
  assert.ok(relateCall);
  assert.equal(relateCall.allowedKinds[0], "semantic");
  assert.equal(relateCall.sameKind, false);
  assert.equal(relateCall.samePolarity, false);
});

test("upsertMemory skips auto-relate when deduped", async () => {
  const mem = new MemoryService({ ...baseConfig, autoRelate: { enabled: true } });
  const sessions = [];
  const readSession = {
    run: async () => ({
      records: [
        {
          get: () => "mem_existing",
        },
      ],
    }),
    close: async () => {},
  };
  const writeSession = {
    run: async () => ({ records: [] }),
    close: async () => {},
  };

  mem.client = {
    session: (mode) => {
      sessions.push(mode);
      return mode === "READ" ? readSession : writeSession;
    },
  };

  const res = await mem.upsertMemory({
    kind: "semantic",
    title: "Duplicate memory",
    content: "This content will be deduped by content hash.",
    tags: ["dup"],
    confidence: 0.9,
  });

  assert.equal(res.deduped, true);
  assert.deepEqual(sessions, ["READ"]);
});

test("upsertMemory respects auto-relate disabled config", async () => {
  const mem = new MemoryService({ ...baseConfig, autoRelate: { enabled: false } });
  const calls = [];
  const readSession = {
    run: async () => ({ records: [] }),
    close: async () => {},
  };
  const writeSession = {
    run: async (_query, params) => {
      calls.push(params);
      return { records: [] };
    },
    close: async () => {},
  };

  mem.client = {
    session: (mode) => (mode === "READ" ? readSession : writeSession),
  };

  await mem.upsertMemory({
    kind: "semantic",
    title: "No auto relate",
    content: "This content should not trigger auto relations.",
    tags: ["tag"],
    confidence: 0.9,
  });

  const relateCall = calls.find((params) => params?.minSharedTags !== undefined);
  assert.equal(relateCall, undefined);
});

test("upsertMemory auto-relate uses defaults when config omitted", async () => {
  const mem = new MemoryService(baseConfig);
  const calls = [];
  const readSession = {
    run: async () => ({ records: [] }),
    close: async () => {},
  };
  const writeSession = {
    run: async (_query, params) => {
      calls.push(params);
      return { records: [] };
    },
    close: async () => {},
  };

  mem.client = {
    session: (mode) => (mode === "READ" ? readSession : writeSession),
  };

  await mem.upsertMemory({
    kind: "semantic",
    title: "Default auto relate",
    content: "This should use default auto-relate thresholds.",
    tags: ["one", "two"],
    confidence: 0.9,
  });

  const relateCall = calls.find((params) => params?.minSharedTags === 2);
  assert.ok(relateCall);
  assert.equal(relateCall.minWeight, 0.2);
  assert.equal(relateCall.maxCandidates, 12);
  assert.equal(relateCall.sameKind, true);
  assert.equal(relateCall.samePolarity, true);
});

test("upsertMemory skips auto-relate when tags below minSharedTags", async () => {
  const mem = new MemoryService({ ...baseConfig, autoRelate: { minSharedTags: 3 } });
  const calls = [];
  const readSession = {
    run: async () => ({ records: [] }),
    close: async () => {},
  };
  const writeSession = {
    run: async (_query, params) => {
      calls.push(params);
      return { records: [] };
    },
    close: async () => {},
  };

  mem.client = {
    session: (mode) => (mode === "READ" ? readSession : writeSession),
  };

  await mem.upsertMemory({
    kind: "semantic",
    title: "Too few tags",
    content: "This should not trigger auto relate.",
    tags: ["one", "two"],
    confidence: 0.9,
  });

  const relateCall = calls.find((params) => params?.minSharedTags === 3);
  assert.equal(relateCall, undefined);
});

test("upsertMemory allows auto-relate when allowedKinds is empty", async () => {
  const mem = new MemoryService({ ...baseConfig, autoRelate: { allowedKinds: [] } });
  const calls = [];
  const readSession = {
    run: async () => ({ records: [] }),
    close: async () => {},
  };
  const writeSession = {
    run: async (_query, params) => {
      calls.push(params);
      return { records: [] };
    },
    close: async () => {},
  };

  mem.client = {
    session: (mode) => (mode === "READ" ? readSession : writeSession),
  };

  await mem.upsertMemory({
    kind: "episodic",
    title: "Allowed kinds empty",
    content: "This should still allow auto relate when tags are sufficient.",
    tags: ["one", "two"],
    confidence: 0.9,
  });

  const relateCall = calls.find((params) => params?.minSharedTags === 2);
  assert.ok(relateCall);
  assert.deepEqual(relateCall.allowedKinds, []);
});

test("feedback returns updated edges and uses item payloads", async () => {
  const mem = new MemoryService(baseConfig);
  const calls = [];
  const writeSession = {
    run: async (_query, params) => {
      calls.push(params);
      if (params?.items) {
        return {
          records: [
            {
              get: (key) => {
                if (key === "id") return "mem-1";
                if (key === "a") return 2.0;
                if (key === "b") return 1.0;
                if (key === "strength") return 0.66;
                if (key === "evidence") return 3.0;
                if (key === "updatedAt") return "2024-01-03T00:00:00Z";
                return undefined;
              },
            },
          ],
        };
      }
      return { records: [] };
    },
    close: async () => {},
  };

  mem.client = {
    session: () => writeSession,
  };

  const res = await mem.feedback({
    agentId: "agent-1",
    sessionId: "session-1",
    usedIds: ["mem-1"],
    usefulIds: ["mem-1"],
    notUsefulIds: [],
  });

  const feedbackCall = calls.find((params) => Array.isArray(params?.items));
  assert.ok(feedbackCall);
  assert.equal(feedbackCall.items[0].memoryId, "mem-1");
  assert.ok(res.updated.length === 1);
  assert.equal(res.updated[0].id, "mem-1");
  assert.equal(res.updated[0].edge.strength, 0.66);
});

test("getMemoriesById returns full records", async () => {
  const mem = new MemoryService(baseConfig);
  const readSession = {
    run: async () => ({
      records: [
        {
          get: (key) => {
            if (key !== "memories") return undefined;
            return [
              {
                id: "mem-1",
                kind: "semantic",
                polarity: "positive",
                title: "Concept",
                content: "Content body",
                tags: ["tag"],
                confidence: 0.8,
                utility: 0.3,
                triage: JSON.stringify({ symptoms: ["s1"], likelyCauses: ["c1"] }),
                antiPattern: JSON.stringify({ action: "bad", whyBad: "risk" }),
                createdAt: { toString: () => "2024-01-01T00:00:00Z" },
                updatedAt: { toString: () => "2024-01-02T00:00:00Z" },
                env: { os: "macos" },
              },
            ];
          },
        },
      ],
    }),
    close: async () => {},
  };

  mem.client = {
    session: () => readSession,
  };

  const res = await mem.getMemoriesById({ ids: ["mem-1"] });
  assert.equal(res.length, 1);
  assert.equal(res[0].triage?.symptoms[0], "s1");
  assert.equal(res[0].antiPattern?.action, "bad");
  assert.equal(res[0].env?.os, "macos");
});

test("getMemoryGraph returns nodes and edges", async () => {
  const mem = new MemoryService(baseConfig);
  const readSession = {
    run: async () => ({
      records: [
        {
          get: (key) => {
            if (key === "nodes") {
              return [
                {
                  id: "mem-1",
                  kind: "semantic",
                  polarity: "positive",
                  title: "Concept",
                  content: "Content body",
                  tags: ["tag"],
                  confidence: 0.8,
                  utility: 0.3,
                  triage: null,
                  antiPattern: null,
                },
              ];
            }
            if (key === "edges") {
              return [
                {
                  source: "agent-1",
                  target: "mem-1",
                  kind: "recalls",
                  strength: 0.7,
                  evidence: 2.0,
                  updatedAt: "2024-01-02T00:00:00Z",
                },
              ];
            }
            return undefined;
          },
        },
      ],
    }),
    close: async () => {},
  };

  mem.client = {
    session: () => readSession,
  };

  const res = await mem.getMemoryGraph({ agentId: "agent-1", memoryIds: ["mem-1"] });
  assert.equal(res.nodes.length, 1);
  assert.equal(res.edges.length, 1);
  assert.equal(res.edges[0].kind, "recalls");
});
