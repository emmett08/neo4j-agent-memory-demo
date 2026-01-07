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
  assert.ok(captured.learnings[0].content.includes("Summary:"));
  assert.ok(!captured.learnings[0].content.includes("Prompt:"));
  assert.ok(!captured.learnings[0].content.includes("Response:"));
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

test("saveLearnings passes agentId into upsertMemory (WROTE edge)", async () => {
  const mem = new MemoryService(baseConfig);
  const writeCalls = [];
  const readSession = {
    run: async () => ({ records: [] }),
    close: async () => {},
  };
  const writeSession = {
    run: async (_query, params) => {
      writeCalls.push(params);
      return { records: [{ get: () => "mem_demo" }] };
    },
    close: async () => {},
  };

  mem.client = {
    session: (mode) => (mode === "READ" ? readSession : writeSession),
  };

  await mem.saveLearnings({
    agentId: "Auggie",
    sessionId: "run-1",
    learnings: [
      {
        kind: "semantic",
        title: "Test memory",
        content: "Short content that is long enough to pass validation gates.",
        tags: ["test"],
        confidence: 0.9,
      },
    ],
  });

  assert.equal(writeCalls[0].agentId, "Auggie");
  assert.equal(writeCalls[0].taskId, "run-1");
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
  const calls = [];
  const readSession = {
    run: async (_query, params) => {
      calls.push(params);
      return {
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
      };
    },
    close: async () => {},
  };

  mem.client = {
    session: () => readSession,
  };

  const res = await mem.getMemoryGraph({ agentId: "agent-1", memoryIds: ["mem-1"], includeRelatedTo: true });
  assert.equal(res.nodes.length, 1);
  assert.equal(res.edges.length, 1);
  assert.equal(res.edges[0].kind, "recalls");
  assert.equal(calls[0].includeRelatedTo, true);
});

test("getKnowledgeGraphByTags returns query, nodes, and edges", async () => {
  const mem = new MemoryService(baseConfig);
  const calls = [];
  const readSession = {
    run: async (_query, params) => {
      calls.push(params);
      return {
        records: [
          {
            get: (key) => {
              if (key === "query") return { id: "tag_query", tags: ["npm", "permissions"] };
              if (key === "nodes") {
                return [
                  {
                    id: "mem-1",
                    kind: "semantic",
                    polarity: "positive",
                    title: "Concept",
                    content: "Content body",
                    tags: ["npm"],
                    confidence: 0.8,
                    utility: 0.3,
                    triage: null,
                    antiPattern: null,
                    createdAt: { toString: () => "2024-01-01T00:00:00Z" },
                    updatedAt: { toString: () => "2024-01-02T00:00:00Z" },
                  },
                ];
              }
              if (key === "edges") {
                return [
                  {
                    source: "tag_query",
                    target: "mem-1",
                    kind: "tag_match",
                    strength: 0.5,
                    evidence: 1.0,
                    matchedTags: ["npm"],
                  },
                ];
              }
              return undefined;
            },
          },
        ],
      };
    },
    close: async () => {},
  };

  mem.client = {
    session: () => readSession,
  };

  const res = await mem.getKnowledgeGraphByTags({ tags: ["npm", "permissions"], limit: 10, minStrength: 0.2 });
  assert.equal(res.query.id, "tag_query");
  assert.equal(res.nodes.length, 1);
  assert.equal(res.edges.length, 1);
  assert.equal(res.edges[0].kind, "tag_match");
  assert.equal(calls[0].limit, 10);
  assert.equal(calls[0].minStrength, 0.2);
});

test("feedback supports neutral usage without penalizing", async () => {
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
                if (key === "a") return 1.5;
                if (key === "b") return 1.5;
                if (key === "strength") return 0.5;
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

  await mem.feedback({
    agentId: "agent-1",
    sessionId: "session-1",
    usedIds: ["mem-1"],
    usefulIds: [],
    notUsefulIds: [],
    neutralIds: ["mem-1"],
    updateUnratedUsed: false,
  });

  const feedbackCall = calls.find((params) => Array.isArray(params?.items));
  assert.ok(feedbackCall);
  assert.equal(feedbackCall.items[0].y, 0.5);
});

test("retrieveContextBundle falls back when no cases exist", async () => {
  const mem = new MemoryService(baseConfig);

  const session = {
    run: async (_query, params) => {
      // Primary bundle query includes caseLimit/fixLimit/dontLimit + halfLifeSeconds and no prompt/fulltextIndex.
      if (params?.caseLimit !== undefined && params?.halfLifeSeconds !== undefined && params?.prompt === undefined) {
        return {
          records: [
            {
              get: (key) => (key === "sections" ? { fixes: [], doNot: [] } : undefined),
            },
          ],
        };
      }
      // Fallback query includes prompt + fulltextIndex/vectorIndex flags.
      if (params?.prompt !== undefined && params?.fulltextIndex !== undefined) {
        return {
          records: [
            {
              get: (key) =>
                key === "sections"
                  ? {
                      fixes: [
                        {
                          id: "mem-1",
                          kind: "semantic",
                          polarity: "positive",
                          title: "Fallback",
                          content: "Content",
                          tags: ["tag"],
                          confidence: 0.8,
                          utility: 0.3,
                        },
                      ],
                      doNot: [],
                    }
                  : undefined,
            },
          ],
        };
      }
      // Recall edges query includes ids + agentId.
      if (Array.isArray(params?.ids) && params?.agentId) {
        return { records: [] };
      }
      return { records: [] };
    },
    close: async () => {},
  };

  mem.client = { session: () => session };

  const res = await mem.retrieveContextBundle({
    agentId: "agent-1",
    prompt: "permission denied",
    tags: ["npm"],
    fallback: { enabled: true, useFulltext: false, useTags: true },
  });

  assert.equal(res.sections.fix.length, 1);
  assert.equal(res.sections.fix[0].id, "mem-1");
});

test("retrieveContextBundleWithGraph returns bundle and graph", async () => {
  const mem = new MemoryService(baseConfig);
  mem.retrieveContextBundle = async () => ({
    sessionId: "s1",
    sections: {
      fix: [{ id: "m1" }],
      doNotDo: [],
    },
    injection: { fixBlock: "", doNotDoBlock: "" },
  });
  mem.getMemoryGraph = async () => ({ nodes: [], edges: [{ kind: "related_to" }] });

  const res = await mem.retrieveContextBundleWithGraph({
    agentId: "agent-1",
    prompt: "test",
  });

  assert.equal(res.bundle.sessionId, "s1");
  assert.equal(res.graph.edges.length, 1);
});

test("captureUsefulLearning skips save when not useful", async () => {
  const mem = new MemoryService(baseConfig);
  let called = false;

  mem.saveLearnings = async () => {
    called = true;
    return { saved: [], rejected: [] };
  };

  const res = await mem.captureUsefulLearning({
    agentId: "agent-1",
    useful: false,
    learning: {
      kind: "semantic",
      title: "Skip",
      content: "This should not save.",
      tags: ["tag"],
      confidence: 0.9,
    },
  });

  assert.equal(called, false);
  assert.equal(res.rejected[0].reason, "not marked useful");
});

test("listMemoryEdges returns edges", async () => {
  const mem = new MemoryService(baseConfig);
  const session = {
    run: async () => ({
      records: [
        {
          get: (key) =>
            key === "edges"
              ? [
                  {
                    source: "m1",
                    target: "m2",
                    kind: "related_to",
                    strength: 0.9,
                    evidence: 0.0,
                  },
                ]
              : undefined,
        },
      ],
    }),
    close: async () => {},
  };

  mem.client = { session: () => session };

  const res = await mem.listMemoryEdges({ limit: 5, minStrength: 0.2 });
  assert.equal(res.length, 1);
  assert.equal(res[0].kind, "related_to");
});

test("createCase generates id when missing", async () => {
  const mem = new MemoryService(baseConfig);
  let captured = null;

  mem.upsertCase = async (payload) => {
    captured = payload;
    return payload.id;
  };

  const res = await mem.createCase({
    title: "Case",
    summary: "Summary",
    outcome: "resolved",
    symptoms: ["eacces"],
    env: {},
    resolvedByMemoryIds: [],
    negativeMemoryIds: [],
  });

  assert.ok(res.startsWith("case_"));
  assert.equal(captured.id, res);
});
