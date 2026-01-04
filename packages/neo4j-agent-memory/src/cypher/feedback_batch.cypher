// :param {
//   nowIso: "2026-01-04T22:00:00Z",
//   agentId: "agent-123",
//   halfLifeSeconds: 86400,
//   aMin: 1.0,
//   bMin: 1.0,
//   w: 1.0,
//   y: 1.0,
//   items: ["memory-456", "memory-789"]
// }
WITH datetime($nowIso) AS now

UNWIND $items AS memoryId
WITH now, memoryId
WHERE memoryId IS NOT NULL AND memoryId <> ""

MATCH (a:Agent {id: $agentId})
MATCH (m:Memory {id: memoryId})

MERGE (a)-[r:RECALLS]->(m)
ON CREATE SET
  r.a = 1.0,
  r.b = 1.0,
  r.updatedAt = now,
  r.uses = 0,
  r.successes = 0,
  r.failures = 0

WITH now, r,
     CASE
       WHEN duration.inSeconds(coalesce(r.updatedAt, now), now).seconds > 0
       THEN duration.inSeconds(coalesce(r.updatedAt, now), now).seconds
       ELSE 0
     END AS dt

WITH now, r,
     0.5 ^ (dt / $halfLifeSeconds) AS gamma,
     coalesce(r.a, $aMin) AS aPrev,
     coalesce(r.b, $bMin) AS bPrev

WITH now, r, gamma,
     ($aMin + gamma * (aPrev - $aMin)) AS a0,
     ($bMin + gamma * (bPrev - $bMin)) AS b0

WITH now, r,
     (a0 + $w * $y) AS a1,
     (b0 + $w * (1.0 - $y)) AS b1

SET r.a = a1,
    r.b = b1,
    r.strength = a1 / (a1 + b1),
    r.evidence = a1 + b1,
    r.updatedAt = now,
    r.uses = coalesce(r.uses, 0) + 1,
    r.successes = coalesce(r.successes, 0) + CASE WHEN $y >= 0.5 THEN 1 ELSE 0 END,
    r.failures = coalesce(r.failures, 0) + CASE WHEN $y < 0.5 THEN 1 ELSE 0 END

RETURN count(*) AS updated;
