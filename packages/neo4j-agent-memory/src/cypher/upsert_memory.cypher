// Parameters (Neo4j Browser / Neo4j VSCode :param) - example only:
// :param { agentId: "Auggie", taskId: "task_demo", id: "mem_demo", kind: "semantic", polarity: "positive", title: "Fix npm permissions", content: "Use chown on the npm cache and retry the install.", summary: "Fix permissions and retry install.", whenToUse: ["eacces", "node_modules"], howToApply: ["chown -R ...", "npm install"], gotchas: ["do not sudo npm install"], scopeRepo: "neo4j-agent-memory-demo", scopePackage: "neo4j-agent-memory", scopeModule: "memory_service", scopeRuntime: "node", scopeVersions: ["neo4j@5"], evidence: ["error: EACCES"], outcome: "success", validFromIso: null, validToIso: null, contentHash: "sha256_demo", tags: ["npm", "permissions"], confidence: 0.9, utility: 0.2, triage: null, signals: null, distilled: null, antiPattern: null, concepts: ["permissions"], symptoms: ["eacces", "permission denied"], filePaths: ["apps/demo-api/src/seed.ts"], toolNames: ["npm"], errorSignatures: [{ id: "err_demo", text: "EACCES: permission denied" }] }
//
// Parameters:
// - $agentId: Optional agent identifier string (creates (Agent)-[:WROTE]->(Memory))
// - $taskId: Optional task/run identifier string (creates (Task)-[:PRODUCED]->(Memory), and optionally (Agent)-[:RAN]->(Task))
// - $id: Unique memory identifier string
// - $kind: Memory type ("semantic", "procedural", or "episodic")
// - $polarity: Memory polarity ("positive" or "negative")
// - $title: Memory title string
// - $content: Memory content/description string
// - $summary: Optional 1-3 sentence summary (no transcript)
// - $whenToUse: Optional array of trigger strings
// - $howToApply: Optional array of step strings
// - $gotchas: Optional array of failure/dead-end strings
// - $scopeRepo/$scopePackage/$scopeModule/$scopeRuntime: Optional scope fields
// - $scopeVersions: Optional scope versions array
// - $evidence: Optional array of evidence strings (logs/hashes/links)
// - $outcome: Optional outcome ("success" | "partial" | "dead_end")
// - $validFromIso: Optional ISO string (or null) for validity start
// - $validToIso: Optional ISO string (or null) for validity end
// - $contentHash: SHA-256 hash of canonical content for deduplication
// - $tags: Array of tag strings
// - $confidence: Confidence score (0.0 to 1.0)
// - $utility: Utility score (0.0 to 1.0)
// - $triage: Optional triage object (JSON)
// - $signals: Optional signals object (JSON)
// - $distilled: Optional distilled object (JSON)
// - $antiPattern: Optional antiPattern object (JSON)
// - $concepts: Optional array of concept strings
// - $symptoms: Optional array of symptom strings (normalised)
// - $filePaths: Optional array of file paths touched
// - $toolNames: Optional array of tool identifiers used
// - $errorSignatures: Optional array of {id, text} objects (caller-generated ids)
MERGE (m:Memory { id: $id })
ON CREATE SET
  m.kind = $kind,
  m.polarity = $polarity,
  m.title = $title,
  m.content = $content,
  m.summary = $summary,
  m.whenToUse = $whenToUse,
  m.howToApply = $howToApply,
  m.gotchas = $gotchas,
  m.scopeRepo = $scopeRepo,
  m.scopePackage = $scopePackage,
  m.scopeModule = $scopeModule,
  m.scopeRuntime = $scopeRuntime,
  m.scopeVersions = $scopeVersions,
  m.evidence = $evidence,
  m.outcome = $outcome,
  m.validFrom = CASE WHEN $validFromIso IS NULL THEN null ELSE datetime($validFromIso) END,
  m.validTo = CASE WHEN $validToIso IS NULL THEN null ELSE datetime($validToIso) END,
  m.contentHash = $contentHash,
  m.tags = $tags,
  m.confidence = $confidence,
  m.utility = $utility,
  m.triage = $triage,
  m.signals = $signals,
  m.distilled = $distilled,
  m.antiPattern = $antiPattern,
  m.concepts = $concepts,
  m.symptoms = $symptoms,
  m.createdAt = datetime(),
  m.updatedAt = datetime()
ON MATCH SET
  m.kind = $kind,
  m.polarity = $polarity,
  m.title = $title,
  m.content = $content,
  m.summary = $summary,
  m.whenToUse = $whenToUse,
  m.howToApply = $howToApply,
  m.gotchas = $gotchas,
  m.scopeRepo = $scopeRepo,
  m.scopePackage = $scopePackage,
  m.scopeModule = $scopeModule,
  m.scopeRuntime = $scopeRuntime,
  m.scopeVersions = $scopeVersions,
  m.evidence = $evidence,
  m.outcome = $outcome,
  m.validFrom = CASE WHEN $validFromIso IS NULL THEN m.validFrom ELSE datetime($validFromIso) END,
  m.validTo = CASE WHEN $validToIso IS NULL THEN m.validTo ELSE datetime($validToIso) END,
  m.tags = $tags,
  m.confidence = $confidence,
  m.utility = $utility,
  m.triage = $triage,
  m.signals = $signals,
  m.distilled = $distilled,
  m.antiPattern = $antiPattern,
  m.concepts = $concepts,
  m.symptoms = $symptoms,
  m.updatedAt = datetime()
WITH
  m,
  $agentId AS agentId,
  $taskId AS taskId,
  [t IN coalesce($tags, []) WHERE t IS NOT NULL AND trim(toString(t)) <> ""] AS rawTags,
  [c IN coalesce($concepts, []) WHERE c IS NOT NULL AND trim(toString(c)) <> ""] AS rawConcepts,
  [s IN coalesce($symptoms, []) WHERE s IS NOT NULL AND trim(toString(s)) <> ""] AS rawSymptoms,
  [p IN coalesce($filePaths, []) WHERE p IS NOT NULL AND trim(toString(p)) <> ""] AS rawPaths,
  [n IN coalesce($toolNames, []) WHERE n IS NOT NULL AND trim(toString(n)) <> ""] AS rawTools,
  [e IN coalesce($errorSignatures, []) WHERE e IS NOT NULL] AS rawErrors
FOREACH (_ IN CASE WHEN agentId IS NULL OR trim(toString(agentId)) = "" THEN [] ELSE [1] END |
  MERGE (a:Agent {id: toString(agentId)})
  MERGE (a)-[:WROTE]->(m)
)
FOREACH (_ IN CASE WHEN taskId IS NULL OR trim(toString(taskId)) = "" THEN [] ELSE [1] END |
  MERGE (t:Task {id: toString(taskId)})
  ON CREATE SET t.createdAt = datetime(), t.updatedAt = datetime()
  ON MATCH SET t.updatedAt = datetime()
  MERGE (t)-[:PRODUCED]->(m)
  FOREACH (__ IN CASE WHEN agentId IS NULL OR trim(toString(agentId)) = "" THEN [] ELSE [1] END |
    MERGE (a2:Agent {id: toString(agentId)})
    MERGE (a2)-[:RAN]->(t)
  )
)
WITH
  m,
  agentId,
  taskId,
  [t IN rawTags | toLower(trim(toString(t)))] AS tags,
  [c IN rawConcepts | toLower(trim(toString(c)))] AS concepts,
  rawSymptoms AS symptoms,
  rawPaths AS paths,
  rawTools AS tools,
  rawErrors AS errors
FOREACH (tag IN tags |
  MERGE (t:Tag {name: tag})
  SET t.id = coalesce(t.id, "tag:" + tag)
  MERGE (m)-[:TAGGED]->(t)
)
WITH m, concepts, symptoms, paths, tools, errors
FOREACH (c IN concepts |
  MERGE (k:Concept {name: c})
  SET k.id = coalesce(k.id, "concept:" + c)
  MERGE (m)-[:ABOUT]->(k)
)
WITH m, symptoms, paths, tools, errors
FOREACH (symptomText IN symptoms |
  MERGE (s:Symptom {text: toString(symptomText)})
  SET s.id = coalesce(s.id, "symptom:" + toString(symptomText))
  MERGE (m)-[:HAS_SYMPTOM]->(s)
)
WITH m, paths, tools, errors
FOREACH (p IN paths |
  MERGE (f:File {id: "file:" + toString(p)})
  ON CREATE SET f.path = toString(p), f.createdAt = datetime(), f.updatedAt = datetime()
  ON MATCH SET f.path = toString(p), f.updatedAt = datetime()
  MERGE (m)-[:TOUCHED]->(f)
)
WITH m, tools, errors
FOREACH (n IN tools |
  MERGE (t:Tool {id: "tool:" + toString(n)})
  ON CREATE SET t.name = toString(n), t.createdAt = datetime(), t.updatedAt = datetime()
  ON MATCH SET t.name = toString(n), t.updatedAt = datetime()
  MERGE (m)-[:USED_TOOL]->(t)
)
WITH m, errors
FOREACH (e IN errors |
  MERGE (x:ErrorSignature {id: toString(e.id)})
  ON CREATE SET x.text = toString(e.text), x.createdAt = datetime(), x.updatedAt = datetime()
  ON MATCH SET x.text = coalesce(toString(e.text), x.text), x.updatedAt = datetime()
  MERGE (m)-[:HAS_ERROR_SIG]->(x)
)
RETURN m.id AS id;
