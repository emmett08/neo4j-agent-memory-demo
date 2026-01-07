// Graph-view query for Neo4j Browser/VSCode (NO APOC required).
// Returns Nodes + Relationships so the result can be visualised as a graph.
//
// Parameters (Neo4j Browser / Neo4j VSCode :param) - example only:
// :param { tags: ["npm", "permissions"], limit: 50, minStrength: 0.25 }
//
// Parameters:
// - $tags: Array of query tags
// - $limit: Max number of matching memories
// - $minStrength: Minimum match strength in [0..1]
WITH
  [t IN coalesce($tags, []) WHERE t IS NOT NULL AND trim(toString(t)) <> ""] AS rawTags,
  toInteger(coalesce($limit, 50)) AS lim,
  toFloat(coalesce($minStrength, 0.0)) AS minStrength

WITH
  [t IN rawTags | toLower(trim(toString(t)))] AS qTags,
  lim,
  minStrength

CALL (qTags) {
  WITH qTags
  MATCH (m:Memory)
  WITH m, qTags, [x IN coalesce(m.tags, []) | toLower(toString(x))] AS mTags
  WITH m, qTags, [t IN qTags WHERE t IN mTags] AS matchedTags
  WITH m, matchedTags, size(matchedTags) AS overlap, qTags
  WHERE overlap > 0
  WITH
    m,
    matchedTags,
    overlap,
    CASE WHEN size(qTags) = 0 THEN 0.0 ELSE toFloat(overlap) / toFloat(size(qTags)) END AS strength
  RETURN collect({ id: m.id, matchedTags: matchedTags, overlap: overlap, strength: strength }) AS rows
}

WITH
  rows,
  lim,
  minStrength

UNWIND rows AS row
WITH row, lim, minStrength
WHERE row.strength >= minStrength
ORDER BY row.strength DESC, row.overlap DESC
WITH collect(row) AS collected, lim
WITH collected[..lim] AS rows
WITH rows, [r IN rows | r.id] AS ids

CALL (rows, ids) {
  WITH rows
  UNWIND rows AS row
  MATCH (m:Memory {id: row.id})
  UNWIND row.matchedTags AS tagName
  OPTIONAL MATCH (t:Tag {name: tagName})<-[tagRel:TAGGED]-(m)
  RETURN t AS source, tagRel AS rel, m AS target, row.strength AS strength, toFloat(row.overlap) AS evidence
  UNION
  WITH ids
  UNWIND ids AS id
  MATCH (m:Memory {id: id})
  RETURN m AS source, null AS rel, null AS target, null AS strength, null AS evidence
  UNION
  WITH ids
  UNWIND ids AS aId
  MATCH (a:Memory {id: aId})-[r:CO_USED_WITH]-(b:Memory)
  WHERE b.id IN ids AND a.id < b.id
  RETURN a AS source, r AS rel, b AS target, toFloat(coalesce(r.strength, 0.0)) AS strength, toFloat(coalesce(r.evidence, 0.0)) AS evidence
  UNION
  WITH ids
  UNWIND ids AS aId
  MATCH (a:Memory {id: aId})-[r:RELATED_TO]-(b:Memory)
  WHERE b.id IN ids AND a.id < b.id
  RETURN a AS source, r AS rel, b AS target, toFloat(coalesce(r.weight, 0.5)) AS strength, 1.0 AS evidence
}

RETURN source, rel, target, strength, evidence;
