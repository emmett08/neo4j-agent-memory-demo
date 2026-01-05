// Parameters:
// - $ids: Array of memory ids
WITH [id IN coalesce($ids, []) WHERE id IS NOT NULL AND id <> ""] AS ids
UNWIND range(0, size(ids) - 1) AS idx
WITH idx, ids[idx] AS id
MATCH (m:Memory {id: id})
OPTIONAL MATCH (m)-[:APPLIES_IN]->(e:EnvironmentFingerprint)
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
    .tags,
    .confidence,
    .utility,
    .triage,
    .antiPattern,
    .createdAt,
    .updatedAt,
    env: envs[0]
  }
}) AS rows
UNWIND rows AS row
WITH row
ORDER BY row.idx
RETURN collect(row.memory) AS memories;
