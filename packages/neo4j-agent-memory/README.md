# neo4j-agent-memory

A Neo4j-backed memory system for AI agents:
- semantic / procedural / episodic memories
- case-based reasoning (symptoms -> similar cases -> fixes)
- negative memories ("do not do")
- environment fingerprints for precision
- hybrid retrieval returning a ContextBundle with separate Fix / Do-not-do blocks
- feedback API to reinforce / degrade association weights (agent affinity)

## Install (npm)

```bash
npm install neo4j-agent-memory
```

## Requirements

Hard requirements:
- Node.js 18+
- Neo4j 5+
- Windows, macOS, or Linux

Minimal requirements (tested):
- Neo4j Desktop 2.1.1 (macOS) with a Neo4j 5.x database
- Neo4j Browser + Bolt enabled
- Download: https://neo4j.com/download-thanks-desktop/?edition=desktop&flavour=osx&release=2.1.1&offline=false

## Core API

```ts
import { createMemoryService } from "neo4j-agent-memory";

const mem = await createMemoryService({
  neo4j: { uri, username, password },
  vectorIndex: "memoryEmbedding",
  fulltextIndex: "memoryText",
  halfLifeSeconds: 30 * 24 * 3600
});

const bundle = await mem.retrieveContextBundle({
  agentId: "auggie",
  prompt: "EACCES cannot create node_modules",
  symptoms: ["eacces", "permission denied", "node_modules"],
  tags: ["npm", "node_modules"],
  env: { os: "macos", packageManager: "npm", container: false }
});

await mem.feedback({
  agentId: "auggie",
  sessionId: bundle.sessionId,
  usedIds: bundle.sections.fix.map((m) => m.id),
  usefulIds: bundle.sections.fix.slice(0, 2).map((m) => m.id),
  notUsefulIds: []
});

await mem.close();
```

Notes:
- `createMemoryService` runs schema setup on init.
- Cypher assets are bundled at `dist/cypher` in the published package.

## Tool adapter (createMemoryTools)

Use the tool factory to preserve the existing tool surface used by the demo:

```ts
import { createMemoryService, createMemoryTools } from "neo4j-agent-memory";

const mem = await createMemoryService({ neo4j: { uri, username, password } });
const tools = createMemoryTools(mem);

await tools.store_skill.execute({
  agentId: "auggie",
  title: "Fix npm EACCES on macOS",
  content: "If npm fails with EACCES, chown the cache directory and retry.",
  tags: ["npm", "macos", "permissions"],
});
```

Tool names:
- `store_skill`
- `store_pattern`
- `store_concept`
- `relate_concepts`
- `recall_skills`
- `recall_concepts`
- `recall_patterns`

## Stored UI APIs

List summaries for the UI without legacy Cypher:

```ts
const all = await mem.listMemories({ limit: 50 });
const episodes = await mem.listEpisodes({ agentId: "auggie" });
const skills = await mem.listSkills({ agentId: "auggie" });
const concepts = await mem.listConcepts({ agentId: "auggie" });
```

## Episodic capture helpers

```ts
await mem.captureEpisode({
  agentId: "auggie",
  runId: "run-123",
  workflowName: "triage",
  prompt: "Why is npm failing?",
  response: "We found a permissions issue.",
  outcome: "success",
  tags: ["npm", "triage"],
});

await mem.captureStepEpisode({
  agentId: "auggie",
  runId: "run-123",
  workflowName: "triage",
  stepName: "fix",
  prompt: "Apply the fix",
  response: "Ran chown and reinstalled.",
  outcome: "success",
});
```

## Event hooks

Provide an `onMemoryEvent` callback to observe reads/writes:

```ts
const mem = await createMemoryService({
  neo4j: { uri, username, password },
  onMemoryEvent: (event) => {
    console.log(`[memory:${event.type}] ${event.action}`, event.meta);
  },
});
```

## Schema + cypher exports

Schema helpers and cypher assets are exported for integrations:

```ts
import { ensureSchema, schemaVersion, migrate, cypher } from "neo4j-agent-memory";
```

## Intended usage (demo + API)

This package is used by the demo API in this repository to:
- retrieve a ContextBundle mid-run (`/memory/retrieve`)
- send feedback (`/memory/feedback`)
- save distilled learnings (`/memory/save`)

See the repo for the demo API and UI:
https://github.com/emmett08/neo4j-agent-memory-demo

## Reinforcement model

Edges `RECALLS` and `CO_USED_WITH` are updated using a decayed Beta posterior
(a, b pseudo-counts with exponential forgetting). `strength` is cached as
a/(a+b) and `evidence` as a+b.
