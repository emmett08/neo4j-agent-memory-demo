// Parameters (Neo4j Browser / Neo4j VSCode :param) - example only:
// :param { nowIso: "2026-01-04T22:07:53.086Z", agentId: "agent-123", halfLifeSeconds: 86400, aMin: 1.0, bMin: 1.0, items: [ { memoryId: "mem_8cd773c2-208c-45ad-97ea-1b2337dca751", w: 1.0, y: 1.0 }, { memoryId: "mem_64fbcc73-0b5c-4041-8b6b-66514ffaf1d0", w: 1.0, y: 0.0 } ] }
WITH datetime($nowIso) AS now

UNWIND $items AS item
WITH now, item
WHERE item.memoryId IS NOT NULL AND item.memoryId <> ""

MATCH (a:Agent {id: $agentId})
MATCH (m:Memory {id: item.memoryId})

MERGE (a)-[r:RECALLS]->(m)
ON CREATE SET
  r.a = 1.0,
  r.b = 1.0,
  r.updatedAt = now,
  r.uses = 0,
  r.successes = 0,
  r.failures = 0

WITH now, r, item,
     CASE
       WHEN duration.inSeconds(coalesce(r.updatedAt, now), now).seconds > 0
       THEN duration.inSeconds(coalesce(r.updatedAt, now), now).seconds
       ELSE 0
     END AS dt

WITH now, r, item,
     0.5 ^ (dt / $halfLifeSeconds) AS gamma,
     coalesce(r.a, $aMin) AS aPrev,
     coalesce(r.b, $bMin) AS bPrev

WITH now, r, item, gamma,
     ($aMin + gamma * (aPrev - $aMin)) AS a0,
     ($bMin + gamma * (bPrev - $bMin)) AS b0

WITH now, r, item,
     (a0 + item.w * item.y) AS a1,
     (b0 + item.w * (1.0 - item.y)) AS b1

SET r.a = a1,
    r.b = b1,
    r.strength = a1 / (a1 + b1),
    r.evidence = a1 + b1,
    r.updatedAt = now,
    r.uses = coalesce(r.uses, 0) + 1,
    r.successes = coalesce(r.successes, 0) + CASE WHEN item.y >= 0.5 THEN 1 ELSE 0 END,
    r.failures = coalesce(r.failures, 0) + CASE WHEN item.y < 0.5 THEN 1 ELSE 0 END

RETURN item.memoryId AS id,
       r.a AS a,
       r.b AS b,
       r.strength AS strength,
       r.evidence AS evidence,
       toString(r.updatedAt) AS updatedAt;
