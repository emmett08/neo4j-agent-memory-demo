import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import neo4j from "neo4j-driver";

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const DEFAULT_DATABASE = "neo4j";
const NEO4J_DATABASE = process.env.NEO4J_DATABASE ?? DEFAULT_DATABASE;

const shouldSkip = !NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD;
const run = shouldSkip ? test.skip : test;

const SMOKE_QUERY = "RETURN 1 AS ok";
const DEFAULT_LIMIT = 5;

const here = path.dirname(fileURLToPath(import.meta.url));
const cypherDir = path.resolve(here, "../dist/cypher");

async function withSession(fn) {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ database: NEO4J_DATABASE });
  try {
    await fn(session);
  } finally {
    await session.close();
    await driver.close();
  }
}

run("neo4j smoke: can connect", async () => {
  await withSession(async (session) => {
    const result = await session.run(SMOKE_QUERY);
    assert.ok(result.records.length > 0, "expected at least one record");
    const ok = result.records[0].get("ok");
    const okValue = typeof ok === "number" ? ok : ok.toNumber();
    assert.equal(okValue, 1);
  });
});

run("list_memories.cypher EXPLAINs", async () => {
  const listMemoriesQuery = readFileSync(path.join(cypherDir, "list_memories.cypher"), "utf8");
  await withSession(async (session) => {
    const result = await session.run(`EXPLAIN ${listMemoriesQuery}`, {
      kind: null,
      limit: DEFAULT_LIMIT,
      agentId: null,
    });
    await result.consume();
  });
});

run("auto_relate_memory_by_tags.cypher EXPLAINs", async () => {
  const query = readFileSync(path.join(cypherDir, "auto_relate_memory_by_tags.cypher"), "utf8");
  await withSession(async (session) => {
    const result = await session.run(`EXPLAIN ${query}`, {
      id: "mem_auto_relate_test",
      nowIso: new Date().toISOString(),
      minSharedTags: 2,
      minWeight: 0.2,
      maxCandidates: 5,
      sameKind: true,
      samePolarity: true,
      allowedKinds: ["semantic"],
    });
    await result.consume();
  });
});

run("get_memories_by_id.cypher EXPLAINs", async () => {
  const query = readFileSync(path.join(cypherDir, "get_memories_by_id.cypher"), "utf8");
  await withSession(async (session) => {
    const result = await session.run(`EXPLAIN ${query}`, {
      ids: ["mem_1", "mem_2"],
    });
    await result.consume();
  });
});

run("get_memory_graph.cypher EXPLAINs", async () => {
  const query = readFileSync(path.join(cypherDir, "get_memory_graph.cypher"), "utf8");
  await withSession(async (session) => {
    const result = await session.run(`EXPLAIN ${query}`, {
      agentId: "agent-1",
      memoryIds: ["mem_1", "mem_2"],
      includeNodes: true,
    });
    await result.consume();
  });
});
