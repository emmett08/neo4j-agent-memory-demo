// Quick overview of the seeded knowledge graph.
// Run in Neo4j Browser / Neo4j VSCode.

// :param { sampleLimit: 25 }
WITH toInteger(coalesce($sampleLimit, 25)) AS sampleLimit

CALL db.labels() YIELD label
WITH collect(label) AS labels, sampleLimit

CALL db.relationshipTypes() YIELD relationshipType
WITH labels, collect(relationshipType) AS relTypes, sampleLimit

CALL () {
  MATCH (n)
  RETURN count(n) AS nodeCount
}

CALL () {
  MATCH ()-[r]->()
  RETURN count(r) AS relCount
}

RETURN
  labels,
  relTypes,
  nodeCount,
  relCount,
  sampleLimit;
