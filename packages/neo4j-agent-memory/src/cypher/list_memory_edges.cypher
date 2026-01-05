// Parameters:
// - $limit: Max edges to return
// - $minStrength: Minimum strength threshold
WITH
  coalesce($limit, 200) AS limit,
  coalesce($minStrength, 0.0) AS minStrength

CALL {
  WITH minStrength
  MATCH (m1:Memory)-[c:CO_USED_WITH]->(m2:Memory)
  WHERE coalesce(c.strength, 0.0) >= minStrength
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
RETURN collect(edge)[0..limit] AS edges;
