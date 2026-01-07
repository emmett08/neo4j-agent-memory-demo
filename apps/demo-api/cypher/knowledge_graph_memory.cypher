// Memory-centric neighborhood: related_to, co_used_with, and agent recalls.

// :param { memoryId: "mem_fix_npm_eacces_macos", limit: 200 }
WITH
  coalesce($memoryId, "mem_fix_npm_eacces_macos") AS memoryId,
  toInteger(coalesce($limit, 200)) AS limit

MATCH (m:Memory {id: memoryId})
OPTIONAL MATCH pRelOut = (m)-[:RELATED_TO]->(:Memory)
OPTIONAL MATCH pRelIn = (:Memory)-[:RELATED_TO]->(m)
OPTIONAL MATCH pCoOut = (m)-[:CO_USED_WITH]->(:Memory)
OPTIONAL MATCH pCoIn = (:Memory)-[:CO_USED_WITH]->(m)
OPTIONAL MATCH pRecall = (:Agent)-[:RECALLS]->(m)
RETURN m, pRelOut, pRelIn, pCoOut, pCoIn, pRecall
LIMIT toInteger(coalesce($limit, 200));
