// Return a "knowledge graph" for a tag query by scoring each memory by tag overlap.
// Edges are emitted from a virtual query node to matching memories.
//
// Parameters (Neo4j Browser / Neo4j VSCode :param) - example only:
// :param { tags: ["npm", "permissions"], limit: 50, minStrength: 0.25, includeNodes: true }
//
// Parameters:
// - $tags: Array of query tags
// - $limit: Max number of matching memories
// - $minStrength: Minimum match strength in [0..1]
// - $includeNodes: Include full Memory node payloads if true
WITH
  [t IN coalesce($tags, []) WHERE t IS NOT NULL AND trim(t) <> ""] AS rawTags,
  toInteger(coalesce($limit, 50)) AS limit,
  toFloat(coalesce($minStrength, 0.0)) AS minStrength,
  coalesce($includeNodes, true) AS includeNodes

WITH
  [t IN rawTags | toLower(trim(t))] AS qTags,
  limit,
  minStrength,
  includeNodes,
  "tag_query" AS queryId

MATCH (m:Memory)
WITH
  m,
  qTags,
  limit,
  minStrength,
  includeNodes,
  queryId,
  [x IN coalesce(m.tags, []) | toLower(toString(x))] AS mTags

WITH
  m,
  qTags,
  limit,
  minStrength,
  includeNodes,
  queryId,
  [t IN qTags WHERE t IN mTags] AS matchedTags

WITH
  m,
  qTags,
  includeNodes,
  queryId,
  matchedTags,
  size(matchedTags) AS overlap,
  limit,
  minStrength

WHERE overlap > 0

WITH
  m,
  qTags,
  includeNodes,
  queryId,
  matchedTags,
  overlap,
  limit,
  minStrength,
  CASE
    WHEN size(qTags) = 0 THEN 0.0
    ELSE toFloat(overlap) / toFloat(size(qTags))
  END AS strength

WHERE strength >= minStrength
ORDER BY strength DESC, overlap DESC, m.updatedAt DESC
LIMIT toInteger(coalesce($limit, 50))

WITH
  queryId,
  qTags,
  includeNodes,
  collect({
    id: m.id,
    matchedTags: matchedTags,
    overlap: overlap,
    strength: strength,
    node: CASE
      WHEN includeNodes = true THEN m {
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
        .createdAt,
        .updatedAt
      }
      ELSE null
    END
  }) AS rows

WITH
  queryId,
  qTags,
  [r IN rows | r.id] AS ids,
  [r IN rows | r.node] AS rawNodes,
  [r IN rows | {
    source: queryId,
    target: r.id,
    kind: "tag_match",
    strength: r.strength,
    evidence: toFloat(r.overlap),
    matchedTags: r.matchedTags
  }] AS tagEdges

CALL (ids) {
  WITH ids
  UNWIND ids AS aId
  MATCH (a:Memory {id: aId})-[r:CO_USED_WITH]-(b:Memory)
  WHERE b.id IN ids AND a.id < b.id
  RETURN collect({
    source: a.id,
    target: b.id,
    kind: "co_used_with",
    strength: toFloat(coalesce(r.strength, 0.0)),
    evidence: toFloat(coalesce(r.evidence, 0.0))
  }) AS coUsedEdges
}

CALL (ids) {
  WITH ids
  UNWIND ids AS aId
  MATCH (a:Memory {id: aId})-[r:RELATED_TO]-(b:Memory)
  WHERE b.id IN ids AND a.id < b.id
  RETURN collect({
    source: a.id,
    target: b.id,
    kind: "related_to",
    strength: toFloat(coalesce(r.weight, 0.5)),
    evidence: 1.0
  }) AS relatedEdges
}

WITH
  queryId,
  qTags,
  [n IN rawNodes WHERE n IS NOT NULL] AS nodes,
  tagEdges + coUsedEdges + relatedEdges AS edges

RETURN
  { id: queryId, tags: qTags } AS query,
  nodes AS nodes,
  edges AS edges;
