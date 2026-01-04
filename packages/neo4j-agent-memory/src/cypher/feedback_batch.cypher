// :param {
//   nowIso: "2026-01-04T22:07:53.086Z",
//   agentId: "agent-123",
//   halfLifeSeconds: 86400,
//   aMin: 1.0,
//   bMin: 1.0,
//   w: 1.0,
//   y: 1.0,
//   items: [
//     "mem_8cd773c2-208c-45ad-97ea-1b2337dca751",
//     "mem_64fbcc73-0b5c-4041-8b6b-66514ffaf1d0",
//     "mem_e55b80e2-6156-47bc-a964-9aef596f74a6",
//     "mem_13189119-e3ad-4769-9f2b-2d3e3b8bc07f",
//     "mem_137c3ff7-a81d-453d-8048-5c1b736db6ca",
//     "mem_c0ea5643-3c61-4607-ba9f-67f4c2bb01ee",
//     "mem_aa15e7b6-7f94-445a-9c52-3eb24a315215",
//     "mem_e93e7bb8-b43c-44f5-a5d3-87545d67be59",
//     "mem_b81e3709-35ae-4cab-931d-612dcc2cd43d",
//     "mem_ce8a5b62-7ddb-4618-8a6c-93ed3b425f27",
//     "mem_737df25b-7944-4dee-a7aa-86af93567663"
//   ]
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
