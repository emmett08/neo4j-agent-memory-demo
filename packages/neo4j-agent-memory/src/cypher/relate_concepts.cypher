// Parameters:
// - $a: Memory id (concept A)
// - $b: Memory id (concept B)
// - $weight: Optional relationship weight
MATCH (a:Memory {id: $a})
MATCH (b:Memory {id: $b})
MERGE (a)-[r:RELATED_TO]->(b)
ON CREATE SET r.weight = $weight, r.createdAt = datetime(), r.updatedAt = datetime()
ON MATCH SET r.weight = $weight, r.updatedAt = datetime()
MERGE (b)-[r2:RELATED_TO]->(a)
ON CREATE SET r2.weight = $weight, r2.createdAt = datetime(), r2.updatedAt = datetime()
ON MATCH SET r2.weight = $weight, r2.updatedAt = datetime()
RETURN a.id AS aId, b.id AS bId;
