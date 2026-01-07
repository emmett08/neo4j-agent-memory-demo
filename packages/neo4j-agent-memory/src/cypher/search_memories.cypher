// Fulltext + filters search returning Memory summaries with a relevance score.
//
// Parameters (Neo4j Browser / Neo4j VSCode :param) - example only:
// :param { query: "EACCES node_modules", fulltextIndex: "memoryText", tags: ["npm"], kind: "procedural", outcome: null, scopeRepo: null, scopePackage: null, scopeModule: null, scopeRuntime: "node", scopeVersions: ["20"], topK: 20 }
//
// Parameters:
// - $query: Fulltext query string
// - $fulltextIndex: Fulltext index name (defaults to MemoryService fulltextIndex)
// - $tags: Optional filter; any overlap required
// - $kind: Optional filter
// - $outcome: Optional filter
// - $scopeRepo/$scopePackage/$scopeModule/$scopeRuntime: Optional exact filters
// - $scopeVersions: Optional filter; requires any overlap
// - $topK: Max results
WITH
  toString(coalesce($query, "")) AS q,
  toString(coalesce($fulltextIndex, "")) AS fulltextIndex,
  [t IN coalesce($tags, []) WHERE t IS NOT NULL AND trim(toString(t)) <> ""] AS rawTags,
  coalesce($kind, null) AS kind,
  coalesce($outcome, null) AS outcome,
  coalesce($scopeRepo, null) AS scopeRepo,
  coalesce($scopePackage, null) AS scopePackage,
  coalesce($scopeModule, null) AS scopeModule,
  coalesce($scopeRuntime, null) AS scopeRuntime,
  [v IN coalesce($scopeVersions, []) WHERE v IS NOT NULL AND trim(toString(v)) <> ""] AS rawScopeVersions,
  toInteger(coalesce($topK, 20)) AS topK

WITH
  q,
  fulltextIndex,
  [t IN rawTags | toLower(trim(toString(t)))] AS tags,
  kind,
  outcome,
  scopeRepo,
  scopePackage,
  scopeModule,
  scopeRuntime,
  [v IN rawScopeVersions | toString(v)] AS scopeVersions,
  topK

CALL db.index.fulltext.queryNodes(fulltextIndex, q, {limit: topK}) YIELD node, score
WITH node AS m, score, tags, kind, outcome, scopeRepo, scopePackage, scopeModule, scopeRuntime, scopeVersions
WHERE m IS NOT NULL
  AND (kind IS NULL OR m.kind = kind)
  AND (outcome IS NULL OR m.outcome = outcome)
  AND (scopeRepo IS NULL OR m.scopeRepo = scopeRepo)
  AND (scopePackage IS NULL OR m.scopePackage = scopePackage)
  AND (scopeModule IS NULL OR m.scopeModule = scopeModule)
  AND (scopeRuntime IS NULL OR m.scopeRuntime = scopeRuntime)
  AND (size(tags) = 0 OR any(t IN tags WHERE t IN [x IN coalesce(m.tags, []) | toLower(toString(x))]))
  AND (size(scopeVersions) = 0 OR any(v IN scopeVersions WHERE v IN coalesce(m.scopeVersions, [])))
WITH m, score
ORDER BY score DESC, m.utility DESC, m.updatedAt DESC

RETURN collect(m {
  .id,
  .kind,
  .polarity,
  .title,
  .tags,
  .confidence,
  .utility,
  .createdAt,
  .updatedAt,
  score: score
}) AS results;
