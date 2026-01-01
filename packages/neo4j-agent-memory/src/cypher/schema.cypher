CREATE CONSTRAINT case_id_unique IF NOT EXISTS
FOR (c:Case) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT symptom_text_unique IF NOT EXISTS
FOR (s:Symptom) REQUIRE s.text IS UNIQUE;

CREATE CONSTRAINT env_hash_unique IF NOT EXISTS
FOR (e:EnvironmentFingerprint) REQUIRE e.hash IS UNIQUE;

CREATE CONSTRAINT memory_id_unique IF NOT EXISTS
FOR (m:Memory) REQUIRE m.id IS UNIQUE;

CREATE INDEX memory_polarity IF NOT EXISTS
FOR (m:Memory) ON (m.polarity);

CREATE INDEX memory_kind IF NOT EXISTS
FOR (m:Memory) ON (m.kind);

CREATE CONSTRAINT agent_id_unique IF NOT EXISTS
FOR (a:Agent) REQUIRE a.id IS UNIQUE;
