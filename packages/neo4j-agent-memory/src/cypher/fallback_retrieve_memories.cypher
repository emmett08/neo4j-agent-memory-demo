// Parameters:
// - $prompt: Query text
// - $tags: Array of tags
// - $kinds: Optional kinds filter
// - $fulltextIndex: Fulltext index name
// - $vectorIndex: Vector index name
// - $embedding: Optional embedding vector
// - $useFulltext: boolean
// - $useVector: boolean
// - $useTags: boolean
// - $fixLimit: number
// - $dontLimit: number
WITH
  coalesce($prompt, "") AS prompt,
  coalesce($tags, []) AS tags,
  coalesce($kinds, []) AS kinds,
  coalesce($fulltextIndex, "") AS fulltextIndex,
  coalesce($vectorIndex, "") AS vectorIndex,
  $embedding AS embedding,
  coalesce($useFulltext, true) AS useFulltext,
  coalesce($useVector, false) AS useVector,
  coalesce($useTags, true) AS useTags,
  coalesce($fixLimit, 8) AS fixLimit,
  coalesce($dontLimit, 6) AS dontLimit

CALL {
  WITH useFulltext, fulltextIndex, prompt
  WHERE useFulltext = true AND fulltextIndex <> "" AND prompt <> ""
  CALL db.index.fulltext.queryNodes(fulltextIndex, prompt) YIELD node, score
  RETURN node AS m, score AS score

  UNION

  WITH useTags, tags
  WHERE useTags = true AND size(tags) > 0
  MATCH (m:Memory)
  WHERE any(t IN tags WHERE t IN coalesce(m.tags, []))
  RETURN m, 0.1 AS score

  UNION

  WITH useVector, vectorIndex, embedding
  WHERE useVector = true AND vectorIndex <> "" AND embedding IS NOT NULL
  CALL db.index.vector.queryNodes(vectorIndex, embedding, 20) YIELD node, score
  RETURN node AS m, score AS score
}
WITH m, max(score) AS score, kinds, fixLimit, dontLimit
WHERE m IS NOT NULL AND (size(kinds) = 0 OR m.kind IN kinds)
WITH m, score, fixLimit, dontLimit
ORDER BY score DESC, m.updatedAt DESC

WITH collect(m {
  .id,
  .kind,
  .polarity,
  .title,
  .content,
  .tags,
  .confidence,
  .utility,
  .updatedAt
}) AS rows, fixLimit, dontLimit

WITH
  [m IN rows WHERE m.polarity <> "negative"][0..fixLimit] AS fixes,
  [m IN rows WHERE m.polarity = "negative"][0..dontLimit] AS doNot

RETURN { fixes: fixes, doNot: doNot } AS sections;
