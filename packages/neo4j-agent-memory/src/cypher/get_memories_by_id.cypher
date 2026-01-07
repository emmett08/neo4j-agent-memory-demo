// Parameters (Neo4j Browser / Neo4j VSCode :param) - example only:
// :param { ids: ["mem_1", "mem_2"] }
//
// Parameters:
// - $ids: Array of memory ids
WITH [id IN coalesce($ids, []) WHERE id IS NOT NULL AND id <> ""] AS ids
UNWIND range(0, size(ids) - 1) AS idx
WITH idx, ids[idx] AS id
MATCH (m:Memory {id: id})
// Neo4j VSCode may warn if the relationship type doesn't exist in the connected DB yet.
// Using `type(rel)` keeps behavior while avoiding that warning in empty/dev DBs.
OPTIONAL MATCH (m)-[rel]->(e:EnvironmentFingerprint)
WHERE type(rel) = "APPLIES_IN"
WITH idx, m, collect(e {
  .hash,
  .os,
  .distro,
  .ci,
  .container,
  .filesystem,
  .workspaceMount,
  .nodeVersion,
  .packageManager,
  .pmVersion
}) AS envs
WITH collect({
  idx: idx,
  memory: m {
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
    .concepts,
    .symptoms,
    .createdAt,
    .updatedAt,
    env: envs[0]
  }
}) AS rows
UNWIND rows AS row
WITH row
ORDER BY row.idx
RETURN collect(row.memory) AS memories;
