import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryTools } from "../dist/index.js";

function createStubService() {
  const calls = {
    saveLearnings: [],
    relateConcepts: [],
    listSkills: [],
    listConcepts: [],
  };

  const service = {
    saveLearnings: async (req) => {
      calls.saveLearnings.push(req);
      return { saved: [{ id: "mem1", kind: req.learnings[0].kind, title: req.learnings[0].title, deduped: false }], rejected: [] };
    },
    relateConcepts: async (req) => {
      calls.relateConcepts.push(req);
    },
    listSkills: async (req) => {
      calls.listSkills.push(req);
      return [{ id: "s1", kind: "procedural", polarity: "positive", title: "Skill", tags: [], confidence: 0.7, utility: 0.2 }];
    },
    listConcepts: async (req) => {
      calls.listConcepts.push(req);
      return [
        { id: "c1", kind: "semantic", polarity: "positive", title: "Concept", tags: [], confidence: 0.7, utility: 0.2 },
        { id: "p1", kind: "semantic", polarity: "positive", title: "Pattern", tags: ["pattern"], confidence: 0.7, utility: 0.2 },
      ];
    },
  };

  return { service, calls };
}

test("createMemoryTools wires store tools", async () => {
  const { service, calls } = createStubService();
  const tools = createMemoryTools(service);

  await tools.store_skill.execute({
    agentId: "agent-1",
    title: "Skill Title",
    content: "This is a long enough content string.",
    tags: ["tag1"],
  });

  assert.equal(calls.saveLearnings.length, 1);
  const req = calls.saveLearnings[0];
  assert.equal(req.agentId, "agent-1");
  assert.equal(req.learnings[0].kind, "procedural");
});

test("createMemoryTools stores pattern tag", async () => {
  const { service, calls } = createStubService();
  const tools = createMemoryTools(service);

  await tools.store_pattern.execute({
    agentId: "agent-2",
    title: "Pattern Title",
    content: "Pattern content long enough to be valid.",
    tags: ["tag2"],
  });

  const req = calls.saveLearnings[0];
  assert.ok(req.learnings[0].tags.includes("pattern"));
});

test("createMemoryTools recall tools", async () => {
  const { service, calls } = createStubService();
  const tools = createMemoryTools(service);

  const skills = await tools.recall_skills.execute({ agentId: "agent-3", limit: 5 });
  assert.equal(skills.length, 1);
  assert.equal(calls.listSkills[0].agentId, "agent-3");

  const patterns = await tools.recall_patterns.execute({ agentId: "agent-3" });
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].id, "p1");
});

test("createMemoryTools relates concepts", async () => {
  const { service, calls } = createStubService();
  const tools = createMemoryTools(service);

  await tools.relate_concepts.execute({ sourceId: "c1", targetId: "c2", weight: 0.9 });
  assert.deepEqual(calls.relateConcepts[0], { sourceId: "c1", targetId: "c2", weight: 0.9 });
});
