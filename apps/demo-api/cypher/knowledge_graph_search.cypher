// Search memories by tags and optionally expand to a small subgraph.
// Tags are stored on `m.tags` (array).

// :param { tags: ["npm","permissions"], limit: 200, expand: true }
WITH
  coalesce($tags, []) AS tags,
  toInteger(coalesce($limit, 200)) AS limit,
  coalesce($expand, true) AS expand

MATCH (m:Memory)
WHERE size(tags) = 0 OR any(t IN tags WHERE t IN coalesce(m.tags, []))
WITH collect(m) AS allHits, expand, limit
WITH allHits[0..limit] AS hits, expand, limit

UNWIND hits AS m
OPTIONAL MATCH p = (m)-[:RELATED_TO|CO_USED_WITH]->(m2:Memory)
WHERE expand = true AND m2 IN hits
RETURN m, p
LIMIT toInteger(coalesce($limit, 200));
