WITH datetime($nowIso) AS now
UNWIND $items AS item
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
     // elapsed seconds, safe
     CASE WHEN duration.inSeconds(coalesce(r.updatedAt, now), now).seconds > 0
          THEN duration.inSeconds(coalesce(r.updatedAt, now), now).seconds
          ELSE 0 END AS dt

WITH now, r, item,
     0.5 ^ (dt / $halfLifeSeconds) AS gamma,
     coalesce(r.a, CASE WHEN $aMin > coalesce(r.strength, 0.5) * 2.0 THEN $aMin ELSE coalesce(r.strength, 0.5) * 2.0 END) AS aPrev,
     coalesce(r.b, CASE WHEN $bMin > (1.0 - coalesce(r.strength, 0.5)) * 2.0 THEN $bMin ELSE (1.0 - coalesce(r.strength, 0.5)) * 2.0 END) AS bPrev

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
    r.uses = coalesce(r.uses,0) + 1,
    r.successes = coalesce(r.successes,0) + CASE WHEN item.y >= 0.5 THEN 1 ELSE 0 END,
    r.failures = coalesce(r.failures,0) + CASE WHEN item.y < 0.5 THEN 1 ELSE 0 END

RETURN count(*) AS updated;
