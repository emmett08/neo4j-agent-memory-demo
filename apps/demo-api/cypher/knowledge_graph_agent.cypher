// Agent-centric graph: what an agent recalls, plus memory-to-memory edges.
// Seeded agents include: Seed, Auggie, Agent1, Agent2, Agent3

// :param { agentId: "Seed", limit: 200, minStrength: 0.2, includeRelatedTo: true }
WITH
  coalesce($agentId, "Seed") AS agentId,
  toInteger(coalesce($limit, 200)) AS limit,
  toFloat(coalesce($minStrength, 0.2)) AS minStrength,
  coalesce($includeRelatedTo, true) AS includeRelatedTo

MATCH (a:Agent {id: agentId})
OPTIONAL MATCH (a)-[r:RECALLS]->(m:Memory)
WITH a, m, r, limit, minStrength, includeRelatedTo
WHERE m IS NULL OR coalesce(r.strength, 0.0) >= minStrength

CALL (m, minStrength, includeRelatedTo) {
  WITH m, minStrength, includeRelatedTo
  // Memory-to-memory edges among recalled memories
  OPTIONAL MATCH (m)-[c:CO_USED_WITH]->(m2:Memory)
  WHERE coalesce(c.strength, 0.0) >= minStrength
  WITH m, m2, c, minStrength, includeRelatedTo
  OPTIONAL MATCH (m)-[rel:RELATED_TO]->(m3:Memory)
  WHERE includeRelatedTo = true AND coalesce(rel.weight, 0.0) >= minStrength
  RETURN collect(DISTINCT m2) AS coUsedNodes,
         collect(DISTINCT m3) AS relatedNodes
}

WITH a, collect(DISTINCT m) AS recalled, coUsedNodes, relatedNodes, limit
WITH a, [x IN recalled WHERE x IS NOT NULL] AS recalled, coUsedNodes, relatedNodes, limit

UNWIND (recalled + coUsedNodes + relatedNodes) AS n
WITH a, collect(DISTINCT n) AS nodes, limit

// Return paths for visualization
UNWIND nodes AS m
OPTIONAL MATCH p1 = (a)-[:RECALLS]->(m)
OPTIONAL MATCH p2 = (m)-[:CO_USED_WITH|RELATED_TO]->(m2:Memory)
WHERE m2 IN nodes
RETURN p1, p2
LIMIT toInteger(coalesce($limit, 200));
