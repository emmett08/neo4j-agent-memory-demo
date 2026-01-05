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
  OPTIONAL MATCH (m)-[:APPLIES_IN]->(e:EnvironmentFingerprint)
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
    .tags,
    .confidence,
    .utility,
    .triage,
    .antiPattern,
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
  MATCH (a:Agent {id: agentId})-[r:RECALLS]->(m:Memory)
  WHERE m.id IN ids
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
  MATCH (m1:Memory)-[c:CO_USED_WITH]->(m2:Memory)
  WHERE m1.id IN ids AND m2.id IN ids
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
  MATCH (m1:Memory)-[r:RELATED_TO]->(m2:Memory)
  WHERE m1.id IN ids AND m2.id IN ids
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
