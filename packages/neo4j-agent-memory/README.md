# neo4j-agent-memory

A Neo4j-backed memory system for AI agents:
- semantic / procedural / episodic
- case-based reasoning (symptoms → similar cases → fixes)
- negative memories ("do not do")
- environment fingerprints for precision
- hybrid retrieval returning a ContextBundle with separate Fix / Do-not-do blocks
- feedback API to reinforce / degrade association weights (agent affinity)

## Core API
```ts
import { createMemoryService } from "neo4j-agent-memory";

const mem = await createMemoryService({
  neo4j: { uri, username, password },
  vectorIndex: "memoryEmbedding",
  fulltextIndex: "memoryText",
  halfLifeSeconds: 30*24*3600
});

const bundle = await mem.retrieveContextBundle({
  agentId: "auggie",
  prompt: "EACCES cannot create node_modules",
  symptoms: ["eacces", "permission denied", "node_modules"],
  tags: ["npm","node_modules"],
  env: { os: "macos", packageManager: "npm", container: false }
});

await mem.feedback({
  agentId: "auggie",
  sessionId: bundle.sessionId,
  usedIds: bundle.sections.fix.map(m => m.id),
  usefulIds: bundle.sections.fix.slice(0,2).map(m => m.id),
  notUsefulIds: []
});

await mem.close();
```

See `src/cypher/*` for exact Cypher.


## Reinforcement model
Edges `RECALLS` and `CO_USED_WITH` are updated using a **decayed Beta posterior** (a,b pseudo-counts with exponential forgetting). `strength` is cached as a/(a+b) and `evidence` as a+b.
