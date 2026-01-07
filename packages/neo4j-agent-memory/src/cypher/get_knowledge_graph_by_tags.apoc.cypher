// Graph-view query for Neo4j Browser/VSCode (REQUIRES APOC).
// Creates a virtual query node and virtual weighted relationships to matching memories.
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
  toFloat(coalesce($minStrength, 0.0)) AS minStrength

WITH
  [t IN rawTags | toLower(trim(toString(t)))] AS qTags,
  minStrength,
  "tag_query" AS queryId

MATCH (m:Memory)
WITH m, qTags, queryId, [x IN coalesce(m.tags, []) | toLower(toString(x))] AS mTags, minStrength
WITH m, qTags, queryId, [t IN qTags WHERE t IN mTags] AS matchedTags, minStrength
WITH m, qTags, queryId, matchedTags, size(matchedTags) AS overlap, minStrength
WHERE overlap > 0
WITH
  m,
  qTags,
  queryId,
  matchedTags,
  overlap,
  CASE WHEN size(qTags) = 0 THEN 0.0 ELSE toFloat(overlap) / toFloat(size(qTags)) END AS strength,
  minStrength
WHERE strength >= minStrength
ORDER BY strength DESC, overlap DESC, m.updatedAt DESC
LIMIT toInteger(coalesce($limit, 50))

WITH
  {__labels: ["TagQuery"], id: queryId, tags: qTags} AS q,
  m,
  matchedTags,
  overlap,
  strength

RETURN
  q AS source,
  {
    type: "TAG_MATCH",
    strength: strength,
    evidence: toFloat(overlap),
    matchedTags: matchedTags
  } AS rel,
  m AS target;
