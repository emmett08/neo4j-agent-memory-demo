// Parameters (Neo4j Browser / Neo4j VSCode :param) - example only:
// :param { agentId: "agent-1", memoryIds: ["mem_1", "mem_2"], includeNodes: true, includeRelatedTo: true }
//
// Parameters:
// - $agentId: Agent id for RECALLS edges
// - $memoryIds: Array of memory ids
// - $includeNodes: Boolean to include node payloads
// - $includeRelatedTo: Boolean to include RELATED_TO edges
WITH
  coalesce($agentId, "") AS agentId,
  [id IN coalesce($memoryIds, []) WHERE id IS NOT NULL AND id <> ""] AS ids,
  coalesce($includeNodes, true) AS includeNodes,
  coalesce($includeRelatedTo, false) AS includeRelatedTo

CALL (ids, includeNodes) {
  WITH ids, includeNodes
  MATCH (m:Memory)
  WHERE includeNodes = true AND m.id IN ids
  // Neo4j VSCode may warn if relationship types don't exist in the connected DB yet.
  // Using `type(rel)` keeps behavior while avoiding those warnings in empty/dev DBs.
  OPTIONAL MATCH (m)-[rel]->(e:EnvironmentFingerprint)
  WHERE type(rel) = "APPLIES_IN"
  WITH m, collect(e {
    .hash,
    .os,
    .distro,
    .ci,
    .container,
    .filesystem,
    .workspaceMount,
    .nodeVersion,
    .packageManager,
    .pmVersion
  }) AS envs
  RETURN collect(m {
    .id,
    .kind,
    .polarity,
    .title,
    .content,
    .summary,
    .whenToUse,
    .howToApply,
    .gotchas,
    .scopeRepo,
    .scopePackage,
    .scopeModule,
    .scopeRuntime,
    .scopeVersions,
    .evidence,
    .outcome,
    .validFrom,
    .validTo,
    .tags,
    .confidence,
    .utility,
    .triage,
    .signals,
    .distilled,
    .antiPattern,
    .concepts,
    .symptoms,
    .createdAt,
    .updatedAt,
    env: envs[0]
  }) AS nodes

  UNION

  WITH ids, includeNodes
  WHERE includeNodes = false
  RETURN [] AS nodes
}

CALL (ids, agentId) {
  WITH ids, agentId
  WHERE agentId IS NOT NULL AND agentId <> ""
  MATCH (a:Agent {id: agentId})-[r]->(m:Memory)
  WHERE type(r) = "RECALLS" AND m.id IN ids
  RETURN collect({
    source: a.id,
    target: m.id,
    kind: "recalls",
    strength: r.strength,
    evidence: r.evidence,
    updatedAt: toString(r.updatedAt)
  }) AS recallEdges

  UNION

  WITH ids, agentId
  WHERE agentId IS NULL OR agentId = ""
  RETURN [] AS recallEdges
}

CALL (ids) {
  WITH ids
  MATCH (m1:Memory)-[c]->(m2:Memory)
  WHERE type(c) = "CO_USED_WITH" AND m1.id IN ids AND m2.id IN ids
  RETURN collect({
    source: m1.id,
    target: m2.id,
    kind: "co_used_with",
    strength: c.strength,
    evidence: c.evidence,
    updatedAt: toString(c.updatedAt)
  }) AS coUsedEdges
}

CALL (ids, includeRelatedTo) {
  WITH ids, includeRelatedTo
  WHERE includeRelatedTo = true
  MATCH (m1:Memory)-[r]->(m2:Memory)
  WHERE type(r) = "RELATED_TO" AND m1.id IN ids AND m2.id IN ids
  RETURN collect({
    source: m1.id,
    target: m2.id,
    kind: "related_to",
    strength: r.weight,
    evidence: 0.0,
    updatedAt: toString(r.updatedAt)
  }) AS relatedEdges

  UNION

  WITH ids, includeRelatedTo
  WHERE includeRelatedTo = false
  RETURN [] AS relatedEdges
}

RETURN nodes, recallEdges + coUsedEdges + relatedEdges AS edges;
