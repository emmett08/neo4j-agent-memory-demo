# @emmett08/neo4j-agent-memory

A Neo4j-backed memory system for AI agents:
- semantic / procedural / episodic memories
- case-based reasoning (symptoms -> similar cases -> fixes)
- negative memories ("do not do")
- environment fingerprints for precision
- hybrid retrieval returning a ContextBundle with separate Fix / Do-not-do blocks
- feedback API to reinforce / degrade association weights (agent affinity)

## Install (GitHub Packages)

1) Authenticate to GitHub Packages with an npm token that can read packages.
2) Add an `.npmrc` entry for the scope:

```ini
@emmett08:registry=https://npm.pkg.github.com
```

3) Install:

```bash
npm install @emmett08/neo4j-agent-memory
```

## Requirements

Hard requirements:
- Node.js 20+
- Neo4j 5+
- Windows, macOS, or Linux

Minimal requirements (tested):
- Neo4j Desktop 2.1.1 (macOS) with a Neo4j 5.x database
- Neo4j Browser + Bolt enabled
- Download: https://neo4j.com/download-thanks-desktop/?edition=desktop&flavour=osx&release=2.1.1&offline=false

## Core API

```ts
import { createMemoryService } from "@emmett08/neo4j-agent-memory";

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
