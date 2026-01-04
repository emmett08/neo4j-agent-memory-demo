// Parameters (Neo4j Browser :param)
// :param { kind: null, limit: 50, agentId: "" }

// - $kind: Optional memory kind filter ("semantic" | "procedural" | "episodic")
// - $limit: Max number of memories to return
// - $agentId: Optional agent id to filter by RECALLS edges

WITH
  coalesce($kind, null) AS kind,
  coalesce($limit, 50) AS limit,
  coalesce($agentId, "") AS agentId

CALL (kind, agentId) {
  // If agentId provided -> only recalled by that agent
  WITH kind, agentId
  WHERE agentId IS NOT NULL AND agentId <> ""
  MATCH (:Agent {id: agentId})-[:RECALLS]->(m:Memory)
  WHERE kind IS NULL OR m.kind = kind
  RETURN m

  UNION

  // If agentId absent -> all memories
  WITH kind, agentId
  WHERE agentId IS NULL OR agentId = ""
  MATCH (m:Memory)
  WHERE kind IS NULL OR m.kind = kind
  RETURN m
}

WITH m, limit
ORDER BY m.updatedAt DESC

WITH collect(
  m {
    .id,
    .kind,
    .polarity,
    .title,
    .tags,
    .confidence,
    .utility,
    .createdAt,
    .updatedAt
  }
) AS rows, limit

RETURN rows[0..limit] AS memories;
