# @neuralsea/neo4j-agent-memory

A Neo4j-backed memory system for AI agents:
- semantic / procedural / episodic memories
- case-based reasoning (symptoms -> similar cases -> fixes)
- negative memories ("do not do")
- environment fingerprints for precision
- hybrid retrieval returning a ContextBundle with separate Fix / Do-not-do blocks
- feedback API to reinforce / degrade association weights (agent affinity)

## Install (npm)

```bash
npm install @neuralsea/neo4j-agent-memory
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
import { createMemoryService } from "@neuralsea/neo4j-agent-memory";

const mem = await createMemoryService({
  neo4j: { uri, username, password },
  vectorIndex: "memoryEmbedding",
  fulltextIndex: "memoryText",
  halfLifeSeconds: 30 * 24 * 3600,
  autoRelate: {
    enabled: true,
    minSharedTags: 2,
    minWeight: 0.2,
    maxCandidates: 12,
    sameKind: true,
    samePolarity: true,
    allowedKinds: ["semantic", "procedural"]
  }
});

const bundle = await mem.retrieveContextBundle({
  agentId: "auggie",
  prompt: "EACCES cannot create node_modules",
  symptoms: ["eacces", "permission denied", "node_modules"],
  tags: ["npm", "node_modules"],
  env: { os: "macos", packageManager: "npm", container: false },
  fallback: {
    enabled: true,
    useFulltext: true,
    useTags: true,
    useVector: false,
  },
});

const feedback = await mem.feedback({
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
- `feedback()` returns updated RECALLS edge posteriors for the provided memory ids.
- Neutral usage: pass `neutralIds` or `updateUnratedUsed: false` to avoid penalizing retrieved-but-unrated memories.
- Fallback retrieval uses fulltext/tag (and optional vector) search; provide `fallback.embedding` when using vector indexes.
- Agent ids are case-sensitive; using PascalCase ids (e.g. `Auggie`, `Gemini`) is recommended for consistency.

## Design docs

- `packages/neo4j-agent-memory/docs/memory-design.md`

Auto-relate config (defaults):
- `enabled: true`
- `minSharedTags: 2`
- `minWeight: 0.2`
- `maxCandidates: 12`
- `sameKind: true`
- `samePolarity: true`
- `allowedKinds: ["semantic", "procedural"]`

Auto-relate behavior:
- Uses tag overlap with Jaccard weight (`shared / (a + b - shared)`).
- Runs only for newly inserted memories (skips deduped).
- Applies filters for `sameKind`, `samePolarity`, and `allowedKinds`.
- Requires `minSharedTags` and `minWeight` to pass before linking.
- Limits to `maxCandidates` highest-weight neighbors.

Performance note:
- Auto-relate scans candidate memories with tag filtering; for large graphs, keep tags selective and consider tightening `maxCandidates` and `minSharedTags`.

Neo4j Browser params (auto-relate by tags):

```cypher
:param nowIso => "2026-01-04T22:07:53.086Z";
:param id => "mem_8cd773c2-208c-45ad-97ea-1b2337dca751";
:param minSharedTags => 2;
:param minWeight => 0.3;
:param maxCandidates => 10;
:param sameKind => false;
:param samePolarity => false;
:param allowedKinds => [];
```

Note: `:param` lines are only supported in Neo4j Browser; other runners should pass parameters via the driver.

## Tool adapter (createMemoryTools)

Use the tool factory to preserve the existing tool surface used by the demo:

```ts
import { createMemoryService, createMemoryTools } from "@neuralsea/neo4j-agent-memory";

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

## Graph APIs

Fetch full memory records by id:

```ts
const records = await mem.getMemoriesById({ ids: ["mem-1", "mem-2"] });
```

Retrieve a weighted subgraph for UI maps:

```ts
const graph = await mem.getMemoryGraph({
  agentId: "auggie",
  memoryIds: ["mem-1", "mem-2"],
  includeNodes: true,
  includeRelatedTo: true,
});
```

List edges for analytics/audit:

```ts
const edges = await mem.listMemoryEdges({ limit: 500, minStrength: 0.2 });
```

Search stored memories (fulltext + filters):

```ts
const hits = await mem.search({
  query: "EACCES node_modules",
  tags: ["npm", "macos"],
  kind: "procedural",
  topK: 10,
});
```

Upsert a structured memory card (good for agent tool adapters):

```ts
const { id } = await mem.upsert({
  kind: "procedural",
  title: "Fix npm EACCES creating node_modules on macOS",
  summary: "Repair ownership/permissions and avoid sudo installs.",
  whenToUse: ["EACCES", "permission denied", "node_modules"],
  howToApply: ["Use nvm", "chown project and cache", "retry install"],
  gotchas: ["Don't run `sudo npm install`"],
  evidence: ["EACCES: permission denied"],
  scope: { runtime: "node", versions: ["npm@10"] },
  tags: ["npm", "macos", "permissions"],
  outcome: "success",
  confidence: 0.85,
  utility: 0.7,
  agentId: "Auggie",
  taskId: "run_123",
});
```

Link nodes by id (restricted allowlist of relationship types):

```ts
await mem.link("mem_1", "TOUCHED", "file:apps/demo-api/src/seed.ts", { reason: "edited" });
```

Node id conventions (for `mem.link()` and manual Cypher):
- `Memory`: `mem_...`
- `File`: `file:<path>`
- `Tool`: `tool:<name>`
- `Tag`: `tag:<lowercase>`
- `Concept`: `concept:<lowercase>`
- `Symptom`: `symptom:<normalised>`
- `ErrorSignature`: `err:<sha256(text)>` (generated by the service when you pass `errorSignatures`)

Retrieve a tag-based knowledge graph (edges weighted by query tag overlap):

```ts
const kg = await mem.getKnowledgeGraphByTags({
  tags: ["npm", "permissions"],
  limit: 50,
  minStrength: 0.25,
});
```

Retrieve a bundle with graph edges in one call:

```ts
const bundleWithGraph = await mem.retrieveContextBundleWithGraph({
  agentId: "auggie",
  prompt: "EACCES cannot create node_modules",
  tags: ["npm", "node_modules"],
  includeRelatedTo: true,
});
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

## Useful learning capture

```ts
await mem.captureUsefulLearning({
  agentId: "auggie",
  sessionId: "run-123",
  useful: true,
  learning: {
    kind: "semantic",
    title: "Avoid chmod 777 on node_modules",
    content: "Use npm cache ownership fixes instead of chmod 777.",
    tags: ["npm", "permissions"],
    confidence: 0.8,
    utility: 0.3,
  },
});
```

## Case helpers

```ts
await mem.createCase({
  title: "npm EACCES",
  summary: "Permission denied on cache directory.",
  outcome: "resolved",
  symptoms: ["eacces", "permission denied"],
  env: { os: "macos", packageManager: "npm" },
  resolvedByMemoryIds: ["mem-1"],
  negativeMemoryIds: [],
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
import { ensureSchema, schemaVersion, migrate, cypher } from "@neuralsea/neo4j-agent-memory";
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
