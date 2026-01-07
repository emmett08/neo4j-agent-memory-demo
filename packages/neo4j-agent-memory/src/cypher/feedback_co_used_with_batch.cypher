// Parameters (Neo4j Browser / Neo4j VSCode :param) - example only:
// :param { nowIso: "2026-01-04T22:07:53.086Z", halfLifeSeconds: 86400, aMin: 0.001, bMin: 0.001, pairs: [ { a: "mem_1", b: "mem_2", w: 1.0, y: 1.0 }, { a: "mem_2", b: "mem_3", w: 1.0, y: 0.0 } ] }
WITH datetime($nowIso) AS now
UNWIND $pairs AS pair
MATCH (m1:Memory {id: pair.a})
MATCH (m2:Memory {id: pair.b})
MERGE (m1)-[c:CO_USED_WITH]->(m2)
ON CREATE SET
  c.a = 1.0,
  c.b = 1.0,
  c.updatedAt = now

WITH now, c, pair,
     CASE WHEN duration.inSeconds(coalesce(c.updatedAt, now), now).seconds > 0
          THEN duration.inSeconds(coalesce(c.updatedAt, now), now).seconds
          ELSE 0 END AS dt
WITH now, c, pair,
     0.5 ^ (dt / $halfLifeSeconds) AS gamma,
     coalesce(c.a, CASE WHEN $aMin > coalesce(c.strength, 0.5) * 2.0 THEN $aMin ELSE coalesce(c.strength, 0.5) * 2.0 END) AS aPrev,
     coalesce(c.b, CASE WHEN $bMin > (1.0 - coalesce(c.strength, 0.5)) * 2.0 THEN $bMin ELSE (1.0 - coalesce(c.strength, 0.5)) * 2.0 END) AS bPrev

WITH now, c, pair, gamma,
     ($aMin + gamma * (aPrev - $aMin)) AS a0,
     ($bMin + gamma * (bPrev - $bMin)) AS b0

WITH now, c, pair,
     (a0 + pair.w * pair.y) AS a1,
     (b0 + pair.w * (1.0 - pair.y)) AS b1

SET c.a = a1,
    c.b = b1,
    c.strength = a1 / (a1 + b1),
    c.evidence = a1 + b1,
    c.updatedAt = now

RETURN count(*) AS updated;
