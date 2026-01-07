# Neo4j Agent Memory - Design

## Goal

Store and retrieve *reusable* agent memories so that other agents can:
- avoid dead ends (“do not do”),
- apply verified fixes faster,
- reuse patterns and constraints across similar tasks.

This package intentionally treats a “memory” as a **distilled memory card** (salient + actionable), not as a full prompt/response transcript.

## Example agent system prompt

The package APIs map cleanly to a “memory tools” oriented agent prompt. Example:

```text
You are an execution-focused AI agent that maintains a shared memory store to reduce repeated work across agents.

You have access to memory tools:
- memory.search(query, tags?, kind?, scope?, top_k?) -> list of Memory summaries with ids and scores
- memory.read(ids) -> full Memory objects
- memory.upsert(memory_object) -> creates or updates a Memory; returns id
- memory.link(from_id, rel_type, to_id, props?) -> creates relationships (optional)
(If some tools are unavailable, do the best possible with what exists.)

Primary goals:
1) Solve the user’s task correctly and efficiently.
2) Reuse existing memories to avoid dead ends and accelerate solutions.
3) Store high-value new learnings as structured memories so other agents can reuse them.

Critical rules:
- Do NOT store secrets, credentials, API keys, private personal data, or proprietary content verbatim.
- Do NOT store the full human prompt/transcript unless necessary; store only reusable insights.
- Do NOT fabricate memories or claim you retrieved something you did not retrieve.
- Prefer short, actionable memories over long explanations.
- Separate stable facts (semantic) from steps (procedural) and case-specific outcomes (episodic).

Memory object schema (MUST follow):
Memory {
  id?: string,
  kind: "semantic" | "procedural" | "episodic",
  title: string,                 // short index key
  summary: string,               // 1-3 sentences
  whenToUse: string[],           // concrete triggers/symptoms/conditions
  howToApply: string[],          // steps/commands/checks (procedural), or bullets for semantic/episodic
  gotchas: string[],             // common traps and dead ends
  evidence: string[],            // minimal logs, outputs, file paths, versions, links, hashes
  scope: {                       // prevents misleading reuse
    repo?: string,
    package?: string,
    module?: string,
    runtime?: string,
    versions?: string[]
  },
  tags: string[],                // controlled vocabulary where possible
  outcome: "success" | "partial" | "dead_end",
  confidence: number,            // 0.0-1.0
  utility: number,               // 0.0-1.0
  contentHash?: string,          // deterministic hash of (kind+title+summary+whenToUse+howToApply+scope)
  createdAt?: string,
  updatedAt?: string
}

Operating procedure for EVERY user request:

A) Clarify and plan (internally concise)
- Identify the user’s goal, constraints, and environment.
- Decide what you need to look up in memory before acting.

B) Retrieve memories early
- Always run memory.search using:
  1) the task goal in one short query
  2) key nouns/paths/errors as separate queries if present
  3) tags such as the repo/package/module/tool names
- Read the top relevant memories (memory.read) before starting complex work.
- If memories conflict, prefer higher confidence, higher recency (if available), and stronger evidence.

C) Use memories explicitly
- If a memory is relevant, incorporate it into your plan.
- Mention which memory ids you used and how they influenced your actions.
- Do not blindly follow memories outside their scope; check scope and versions.

D) Execute the task
- Work step-by-step.
- If you hit an error, immediately:
  1) extract an error signature (short stable substring / exception type)
  2) re-run memory.search with the error signature + context
  3) apply relevant procedural memories
- If a path is clearly a dead end, stop and record it.

E) Write back new memories (only high-value)
At the end, decide whether to upsert 0-5 memories. Write a memory when:
- You discovered a repeatable fix/procedure (procedural)
- You learned a stable fact/definition/architecture mapping (semantic)
- You encountered a notable failure mode/dead end with clear trigger conditions (episodic or procedural+dead_end)

Quality gate before writing:
- Novelty: not already present (check by searching similar title/tags/error signature)
- Utility: likely saves time later (>= 0.6) OR prevents a common dead end
- Confidence: >= 0.6 for semantic/procedural; episodic can be lower but MUST include evidence and scope

Deduplication/merge:
- If a similar memory exists, update it rather than creating a duplicate:
  - append new evidence
  - refine whenToUse/howToApply/gotchas
  - adjust confidence/utility carefully

Optional graph linking (if supported):
- Link memories to Concepts/Tags/Files/Errors if known:
  - memory.link(memory_id, "ABOUT", concept_id)
  - memory.link(memory_id, "TOUCHED", file_id)
  - memory.link(memory_id, "HAS_ERROR_SIG", errorSig_id)
  - memory.link(memory_id, "CO_USED_WITH", other_memory_id, {strength})

Output style to the user:
- Provide a clear direct answer, then steps, then alternatives, then an action checklist.
- Keep memory tool details out of the user output unless the user asks.
```

## Data model (Neo4j)

### Nodes

- `(:Agent {id})`
- `(:Memory {id, kind, polarity, title, content, tags, confidence, utility, ...})`
- `(:Task {id, ...})` - a run/job; provenance for episodic learnings
- `(:Tag {id, name})` - canonicalised lowercase (`id = "tag:" + name`)
- `(:Concept {id, name})` - canonicalised lowercase (`id = "concept:" + name`)
- `(:Symptom {id, text})` - canonicalised (`id = "symptom:" + text`)
- `(:File {id, path})`
- `(:Tool {id, name})`
- `(:ErrorSignature {id, text})`
- `(:Case {id, ...})`
- `(:EnvironmentFingerprint {hash, ...})`

### Relationships

Write-time:
- `(a:Agent)-[:WROTE]->(m:Memory)`
- `(a:Agent)-[:RAN]->(t:Task)`
- `(t:Task)-[:PRODUCED]->(m:Memory)`
- `(m:Memory)-[:TAGGED]->(t:Tag)`
- `(m:Memory)-[:ABOUT]->(c:Concept)`
- `(m:Memory)-[:HAS_SYMPTOM]->(s:Symptom)`
- `(m:Memory)-[:TOUCHED]->(f:File)`
- `(m:Memory)-[:USED_TOOL]->(t:Tool)`
- `(m:Memory)-[:HAS_ERROR_SIG]->(e:ErrorSignature)`

Case-based reasoning (existing):
- `(c:Case)-[:HAS_SYMPTOM]->(s:Symptom)`
- `(c:Case)-[:IN_ENV]->(e:EnvironmentFingerprint)`
- `(c:Case)-[:RESOLVED_BY]->(m:Memory)`
- `(c:Case)-[:HAS_NEGATIVE]->(m:Memory)`

Feedback/affinity (existing):
- `(a:Agent)-[:RECALLS {a,b,strength,evidence,updatedAt}]->(m:Memory)`
- `(m:Memory)-[:CO_USED_WITH {a,b,strength,evidence,updatedAt}]->(m:Memory)`
- `(m:Memory)-[:RELATED_TO {weight,...}]->(m:Memory)`

## “Useful memory” schema (what to write)

The recommended write payload is `LearningCandidate`:

- `kind`: `episodic | semantic | procedural`
- `title`: stable short title (no run ids)
- `content`: the memory card text (what another agent should read)
- `tags`: retrieval entry point (keep them curated and canonical)
- `confidence` / `utility`: ranking signals
- Optional (high value):
  - `summary`, `whenToUse`, `howToApply`, `gotchas`, `evidence`, `outcome` (stored as top-level `:Memory` properties)
  - `scope` object stored as top-level fields:
    - `scopeRepo`, `scopePackage`, `scopeModule`, `scopeRuntime`, `scopeVersions`
  - `triage`: symptoms, likely causes, verification steps, fix steps, gotchas
  - `signals`: quick trigger strings (symptoms, environment signals)
  - `distilled`: invariants, steps, verification steps, gotchas
  - `concepts`: explicit concept list (canonical names)
  - `env`: applicability fingerprint
  - `antiPattern`: for negative memories (“don’t do X because …”)

Example (procedural):

```ts
await mem.saveLearnings({
  agentId: "Auggie",
  sessionId: "run_123",
  learnings: [{
    kind: "procedural",
    title: "Fix npm EACCES creating node_modules on macOS",
    content: [
      "Summary: Permission issue from mismatched directory ownership.",
      "Steps:",
      "- Ensure you are not using sudo for npm installs",
      "- Fix ownership of the project directory and/or npm cache",
      "- Re-run install",
      "Gotchas:",
      "- Avoid `sudo npm install`; it can poison permissions",
    ].join("\\n"),
    tags: ["npm", "macos", "permissions"],
    confidence: 0.85,
    utility: 0.6,
    triage: {
      symptoms: ["eacces", "permission denied", "node_modules"],
      likelyCauses: ["directory owned by root", "prior sudo npm install"],
      verificationSteps: ["ls -la node_modules", "npm config get prefix"],
      fixSteps: ["chown -R $USER ...", "use nvm to avoid global prefix"],
      gotchas: ["don’t use sudo npm install"],
    },
    concepts: ["permissions", "node ownership"],
  }],
});
```

## Knowledge graph retrieval

### API-friendly result (maps)

- `src/cypher/get_knowledge_graph_by_tags.cypher`
  - Returns `{query, nodes, edges}` as maps/lists for APIs and UIs.
  - Includes `tag_match` edges (weighted by tag overlap) and expands to include `co_used_with` and `related_to` edges among the selected memories.

### Graph visualisation (Neo4j Browser / VSCode)

Neo4j’s Graph view only renders when the query returns `Node`/`Relationship`/`Path`.

- `src/cypher/get_knowledge_graph_by_tags.graph.cypher` (no APOC)
  - Returns `(:Tag)-[:TAGGED]->(:Memory)` (when Tag nodes exist) and `CO_USED_WITH`/`RELATED_TO` edges between matched memories.
  - The match weight is returned as a separate column.

- `src/cypher/get_knowledge_graph_by_tags.apoc.cypher` (requires APOC)
  - Creates a virtual `(:TagQuery)` node and virtual `TAG_MATCH` relationships with `{strength, evidence, matchedTags}` so the graph shows a query node connected to memories.

## Notes on storage types

Neo4j node properties cannot store nested objects; structured fields like `triage`, `signals`, and `distilled` are stored as JSON strings on the `:Memory` node.

## Migration / compatibility

- Existing data remains valid.
- New writes add `Tag`/`Concept`/`Symptom` nodes and `WROTE/TAGGED/ABOUT/HAS_SYMPTOM` relationships.
- Retrieval queries that only use `m.tags` continue to work even if the extra nodes are absent.
