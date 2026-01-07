CREATE CONSTRAINT case_id_unique IF NOT EXISTS
FOR (c:Case) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT symptom_text_unique IF NOT EXISTS
FOR (s:Symptom) REQUIRE s.text IS UNIQUE;

CREATE CONSTRAINT symptom_id_unique IF NOT EXISTS
FOR (s:Symptom) REQUIRE s.id IS UNIQUE;

CREATE CONSTRAINT env_hash_unique IF NOT EXISTS
FOR (e:EnvironmentFingerprint) REQUIRE e.hash IS UNIQUE;

CREATE CONSTRAINT memory_id_unique IF NOT EXISTS
FOR (m:Memory) REQUIRE m.id IS UNIQUE;

CREATE INDEX memory_polarity IF NOT EXISTS
FOR (m:Memory) ON (m.polarity);

CREATE INDEX memory_kind IF NOT EXISTS
FOR (m:Memory) ON (m.kind);

CREATE INDEX memory_tags IF NOT EXISTS
FOR (m:Memory) ON (m.tags);

CREATE CONSTRAINT tag_name_unique IF NOT EXISTS
FOR (t:Tag) REQUIRE t.name IS UNIQUE;

CREATE CONSTRAINT concept_name_unique IF NOT EXISTS
FOR (c:Concept) REQUIRE c.name IS UNIQUE;

CREATE CONSTRAINT task_id_unique IF NOT EXISTS
FOR (t:Task) REQUIRE t.id IS UNIQUE;

CREATE CONSTRAINT file_id_unique IF NOT EXISTS
FOR (f:File) REQUIRE f.id IS UNIQUE;

CREATE CONSTRAINT tool_id_unique IF NOT EXISTS
FOR (t:Tool) REQUIRE t.id IS UNIQUE;

CREATE CONSTRAINT error_sig_id_unique IF NOT EXISTS
FOR (e:ErrorSignature) REQUIRE e.id IS UNIQUE;

// Used by fallback retrieval when case-based reasoning has no matches.
// Index name matches MemoryService default `fulltextIndex`.
CREATE FULLTEXT INDEX memoryText IF NOT EXISTS
FOR (m:Memory) ON EACH [m.title, m.summary, m.content];

CREATE CONSTRAINT agent_id_unique IF NOT EXISTS
FOR (a:Agent) REQUIRE a.id IS UNIQUE;
