// Parameters (Neo4j Browser / Neo4j VSCode :param) - example only:
// :param { limit: 200, minStrength: 0.2 }
//
// Parameters:
// - $limit: Max edges to return
// - $minStrength: Minimum strength threshold
WITH
  toInteger(coalesce($limit, 200)) AS limit,
  coalesce($minStrength, 0.0) AS minStrength

CALL (minStrength) {
  WITH minStrength
  // Neo4j VSCode may warn if relationship types don't exist in the connected DB yet.
  // Using `type(rel)` keeps behavior while avoiding those warnings in empty/dev DBs.
  MATCH (m1:Memory)-[c]->(m2:Memory)
  WHERE type(c) = "CO_USED_WITH" AND coalesce(c.strength, 0.0) >= minStrength
  RETURN {
    source: m1.id,
    target: m2.id,
    kind: "co_used_with",
    strength: c.strength,
    evidence: c.evidence,
    updatedAt: toString(c.updatedAt)
  } AS edge

  UNION

  WITH minStrength
  MATCH (m1:Memory)-[r:RELATED_TO]->(m2:Memory)
  WHERE coalesce(r.weight, 0.0) >= minStrength
  RETURN {
    source: m1.id,
    target: m2.id,
    kind: "related_to",
    strength: r.weight,
    evidence: 0.0,
    updatedAt: toString(r.updatedAt)
  } AS edge
}
WITH edge, limit
ORDER BY edge.strength DESC
WITH collect(edge) AS edges, limit
RETURN edges[0..limit] AS edges;
