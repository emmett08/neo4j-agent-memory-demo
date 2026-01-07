// Parameters:
// - $id: Source memory id
// - $nowIso: ISO timestamp
// - $minSharedTags: Minimum overlapping tags
// - $minWeight: Minimum Jaccard weight to relate
// - $maxCandidates: Max related memories to link
// - $sameKind: Only relate to same kind if true
// - $samePolarity: Only relate to same polarity if true
// - $allowedKinds: Optional list of kinds to consider (empty = all)
// Neo4j Browser params (example only):
// :param nowIso => "2026-01-04T22:07:53.086Z";
// :param id => "mem_8cd773c2-208c-45ad-97ea-1b2337dca751";
// :param minSharedTags => 2;
// :param minWeight => 0.3;
// :param maxCandidates => 10;
// :param sameKind => false;
// :param samePolarity => false;
// :param allowedKinds => [];
WITH datetime($nowIso) AS now
MATCH (src:Memory {id: $id})
WITH src, now, coalesce(src.tags, []) AS srcTags
MATCH (m:Memory)
WHERE m.id <> src.id
  AND (NOT $sameKind OR m.kind = src.kind)
  AND (NOT $samePolarity OR m.polarity = src.polarity)
  AND (size($allowedKinds) = 0 OR m.kind IN $allowedKinds)
WITH
  src,
  now,
  srcTags,
  m,
  size([t IN srcTags WHERE t IN coalesce(m.tags, [])]) AS shared,
  size(srcTags) AS aSize,
  size(coalesce(m.tags, [])) AS bSize
WHERE shared >= toInteger($minSharedTags)
WITH
  src,
  now,
  m,
  shared,
  CASE
    WHEN (aSize + bSize - shared) = 0 THEN 0.0
    ELSE toFloat(shared) / (aSize + bSize - shared)
  END AS weight
WHERE weight >= $minWeight
ORDER BY weight DESC, shared DESC
LIMIT toInteger($maxCandidates)
MERGE (src)-[r:RELATED_TO]->(m)
ON CREATE SET r.weight = weight, r.createdAt = now, r.updatedAt = now
ON MATCH SET r.weight = weight, r.updatedAt = now
MERGE (m)-[r2:RELATED_TO]->(src)
ON CREATE SET r2.weight = weight, r2.createdAt = now, r2.updatedAt = now
ON MATCH SET r2.weight = weight, r2.updatedAt = now
RETURN count(*) AS related;
