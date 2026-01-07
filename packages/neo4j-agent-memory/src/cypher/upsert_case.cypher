// Parameters (Neo4j Browser / Neo4j VSCode :param) - example only:
// :param { caseId: "case_demo", title: "npm EACCES", summary: "Permission denied on cache directory.", outcome: "resolved", symptoms: ["eacces", "permission denied"], env: { hash: "env_demo", os: "macos", distro: null, ci: null, container: false, filesystem: null, workspaceMount: "local", nodeVersion: "20.11.0", packageManager: "npm", pmVersion: "10.9.0" }, resolvedByMemoryIds: ["mem_1"], negativeMemoryIds: [], resolvedAtIso: "2026-01-07T00:00:00Z" }
//
// Parameters:
// - $caseId: Unique case identifier string
// - $title: Case title string
// - $summary: Case summary/description string
// - $outcome: Case outcome/resolution string
// - $symptoms: Array of symptom strings
// - $env: Environment fingerprint object {hash, os, distro, ci, container, filesystem, workspaceMount, nodeVersion, packageManager, pmVersion}
// - $resolvedByMemoryIds: Array of memory IDs that resolved this case
// - $negativeMemoryIds: Array of negative memory IDs (anti-patterns) associated with this case
// - $resolvedAtIso: ISO timestamp string when case was resolved (or null)
MERGE (c:Case { id: $caseId })
ON CREATE SET
  c.title = $title,
  c.summary = $summary,
  c.outcome = $outcome,
  c.createdAt = datetime(),
  c.resolvedAt = CASE WHEN $resolvedAtIso IS NULL THEN null ELSE datetime($resolvedAtIso) END
ON MATCH SET
  c.title = $title,
  c.summary = $summary,
  c.outcome = $outcome,
  c.resolvedAt = CASE WHEN $resolvedAtIso IS NULL THEN c.resolvedAt ELSE datetime($resolvedAtIso) END
WITH c
FOREACH (symptomText IN $symptoms |
  MERGE (s:Symptom { text: symptomText })
  MERGE (c)-[:HAS_SYMPTOM]->(s)
)
WITH c
MERGE (e:EnvironmentFingerprint { hash: $env.hash })
ON CREATE SET
  e.os = $env.os,
  e.distro = $env.distro,
  e.ci = $env.ci,
  e.container = $env.container,
  e.filesystem = $env.filesystem,
  e.workspaceMount = $env.workspaceMount,
  e.nodeVersion = $env.nodeVersion,
  e.packageManager = $env.packageManager,
  e.pmVersion = $env.pmVersion
ON MATCH SET
  e.os = coalesce($env.os, e.os),
  e.distro = coalesce($env.distro, e.distro),
  e.ci = coalesce($env.ci, e.ci),
  e.container = coalesce($env.container, e.container),
  e.filesystem = coalesce($env.filesystem, e.filesystem),
  e.workspaceMount = coalesce($env.workspaceMount, e.workspaceMount),
  e.nodeVersion = coalesce($env.nodeVersion, e.nodeVersion),
  e.packageManager = coalesce($env.packageManager, e.packageManager),
  e.pmVersion = coalesce($env.pmVersion, e.pmVersion)
MERGE (c)-[:IN_ENV]->(e)
WITH c
FOREACH (mid IN $resolvedByMemoryIds |
  MERGE (m:Memory { id: mid })
  MERGE (c)-[:RESOLVED_BY]->(m)
)
WITH c
FOREACH (nid IN $negativeMemoryIds |
  MERGE (n:Memory { id: nid })
  MERGE (c)-[:HAS_NEGATIVE]->(n)
)
RETURN c.id AS caseId;
