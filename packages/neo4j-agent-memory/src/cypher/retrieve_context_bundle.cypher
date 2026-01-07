// Parameters expected at runtime (driver):
// $nowIso, $symptoms, $tags, $env, $agentId, $caseLimit, $fixLimit, $dontLimit, $halfLifeSeconds
// Parameters (Neo4j Browser / Neo4j VSCode :param) - example only:
// :param { nowIso: "2026-01-07T00:00:00Z", symptoms: ["eacces", "permission denied"], tags: ["npm", "permissions"], env: { os: "macos", packageManager: "npm", container: false }, agentId: "agent-1", caseLimit: 5, fixLimit: 8, dontLimit: 6, halfLifeSeconds: 2592000 }
WITH
  datetime(coalesce($nowIso, toString(datetime()))) AS now,
  coalesce($symptoms, []) AS qSymptoms,
  coalesce($tags, []) AS qTags,
  coalesce($env, {}) AS qEnv,
  coalesce($agentId, "") AS agentId,
  toInteger(coalesce($caseLimit, 10)) AS caseLimit,
  toInteger(coalesce($fixLimit, 8)) AS fixLimit,
  toInteger(coalesce($dontLimit, 5)) AS dontLimit,
  coalesce($halfLifeSeconds, 86400.0) AS halfLifeSeconds,
  0.001 AS aMin,
  0.001 AS bMin,
  0.15 AS affK

// 1) Rank cases by symptom match + environment fingerprint similarity.
CALL (now, qSymptoms, qTags, qEnv, caseLimit) {
  WITH now, qSymptoms, qTags, qEnv, caseLimit
  OPTIONAL MATCH (c:Case)
  WITH now, qSymptoms, qTags, qEnv, caseLimit, collect(c) AS cases
  WITH
    now,
    qSymptoms,
    qTags,
    qEnv,
    caseLimit,
    CASE
      WHEN size(cases) = 0 THEN [null]
      ELSE cases
    END AS cases2
  UNWIND cases2 AS c

  OPTIONAL MATCH (c)-[hs]->(sAll:Symptom)
  WHERE type(hs) = "HAS_SYMPTOM"
  WITH
    now,
    qSymptoms,
    qEnv,
    caseLimit,
    c,
    collect(DISTINCT sAll.text) AS caseSymptoms
  WITH
    now,
    qSymptoms,
    qEnv,
    caseLimit,
    c,
    caseSymptoms,
    [t IN qSymptoms WHERE t IN caseSymptoms] AS matched
  WITH
    now,
    qEnv,
    caseLimit,
    c,
    matched,
    caseSymptoms,
    qSymptoms,
    CASE
      WHEN size(qSymptoms) = 0 OR size(caseSymptoms) = 0 THEN 0.0
      ELSE
        (1.0 * size(matched)) /
        toFloat(size(qSymptoms) + size(caseSymptoms) - size(matched))
    END AS symptomScore

  OPTIONAL MATCH (c)-[ie]->(e:EnvironmentFingerprint)
  WHERE type(ie) = "IN_ENV"
  WITH
    c,
    symptomScore,
    qEnv,
    caseLimit,
    e,
    (CASE
        WHEN e IS NULL OR qEnv.os IS NULL OR e.os IS NULL THEN 0.5
        WHEN e.os = qEnv.os THEN 1.0
        ELSE 0.0
      END) AS sOs,
    (CASE
        WHEN e IS NULL OR qEnv.ci IS NULL OR e.ci IS NULL THEN 0.5
        WHEN e.ci = qEnv.ci THEN 1.0
        ELSE 0.0
      END) AS sCi,
    (CASE
        WHEN e IS NULL OR qEnv.container IS NULL OR e.container IS NULL THEN 0.5
        WHEN e.container = qEnv.container THEN 1.0
        ELSE 0.0
      END) AS sContainer,
    (CASE
        WHEN
          e IS NULL OR qEnv.filesystem IS NULL OR e.filesystem IS NULL
          THEN 0.5
        WHEN e.filesystem = qEnv.filesystem THEN 1.0
        ELSE 0.0
      END) AS sFs,
    (CASE
        WHEN
          e IS NULL OR qEnv.workspaceMount IS NULL OR e.workspaceMount IS NULL
          THEN 0.5
        WHEN e.workspaceMount = qEnv.workspaceMount THEN 1.0
        ELSE 0.0
      END) AS sMount

  WITH
    c,
    symptomScore,
    caseLimit,
    (sOs + sCi + sContainer + sFs + sMount) / 5.0 AS envScore
  WITH c, (0.75 * symptomScore + 0.25 * envScore) AS caseScore, caseLimit

  WITH collect({c: c, score: caseScore}) AS rows, caseLimit
  WITH [r IN rows WHERE r.c IS NOT NULL] AS rows, caseLimit
  WITH rows[0..caseLimit] AS topRows
  RETURN [r IN topRows | r.c] AS topCases, [r IN topRows | r.score] AS topScores
}

// 2) Retrieve FIX memories from top cases.
CALL (
  now,
  qTags,
  qEnv,
  topCases,
  topScores,
  aMin,
  bMin,
  affK,
  agentId,
  halfLifeSeconds,
  fixLimit
) {
  WITH
    now,
    qTags,
    qEnv,
    topCases,
    topScores,
    aMin,
    bMin,
    affK,
    agentId,
    halfLifeSeconds,
    fixLimit
  WITH
    now,
    qTags,
    qEnv,
    topCases,
    topScores,
    aMin,
    bMin,
    affK,
    agentId,
    halfLifeSeconds,
    fixLimit,
    CASE
      WHEN size(topCases) = 0 THEN [null]
      ELSE range(0, size(topCases) - 1)
    END AS idxs
  UNWIND idxs AS i
  WITH
    now,
    qTags,
    topCases,
    topScores,
    aMin,
    bMin,
    affK,
    agentId,
    halfLifeSeconds,
    fixLimit,
    CASE
      WHEN i IS NULL THEN null
      ELSE topCases[i]
    END AS c,
    CASE
      WHEN i IS NULL THEN 0.0
      ELSE topScores[i]
    END AS cs

  OPTIONAL MATCH (c)-[rb]->(m:Memory)
  WHERE type(rb) = "RESOLVED_BY" AND coalesce(m.polarity, "positive") = "positive"
  WITH
    now,
    qTags,
    aMin,
    bMin,
    affK,
    agentId,
    halfLifeSeconds,
    fixLimit,
    m,
    max(cs) AS caseContribution

  OPTIONAL MATCH (a:Agent {id: agentId})-[r]->(m)
  WHERE type(r) = "RECALLS"
  WITH
    now,
    qTags,
    aMin,
    bMin,
    affK,
    halfLifeSeconds,
    fixLimit,
    m,
    caseContribution,
    CASE
      WHEN
        duration.inSeconds(coalesce(r.updatedAt, now), now).seconds < 0
        THEN 0
      ELSE duration.inSeconds(coalesce(r.updatedAt, now), now).seconds
    END AS dt,
    coalesce(
      r.a,
      CASE
        WHEN aMin > coalesce(r.strength, 0.5) * 2.0 THEN aMin
        ELSE coalesce(r.strength, 0.5) * 2.0
      END
    ) AS aPrev,
    coalesce(
      r.b,
      CASE
        WHEN bMin > (1.0 - coalesce(r.strength, 0.5)) * 2.0 THEN bMin
        ELSE (1.0 - coalesce(r.strength, 0.5)) * 2.0
      END
    ) AS bPrev

  WITH
    now,
    qTags,
    aMin,
    bMin,
    affK,
    fixLimit,
    m,
    caseContribution,
    aPrev,
    bPrev,
    0.5 ^ (dt / halfLifeSeconds) AS gamma

  WITH
    now,
    qTags,
    aMin,
    bMin,
    affK,
    fixLimit,
    m,
    caseContribution,
    (aMin + gamma * (aPrev - aMin)) AS a0,
    (bMin + gamma * (bPrev - bMin)) AS b0

  WITH
    now,
    qTags,
    affK,
    fixLimit,
    m,
    caseContribution,
    (CASE
        WHEN (a0 + b0) <= 0 THEN 0.0
        ELSE a0 / (a0 + b0)
      END) AS affinityMean,
    (a0 + b0) AS affinityEvidence

  WITH
    now,
    qTags,
    fixLimit,
    m,
    caseContribution,
    affinityMean * (1 - exp(- affK * affinityEvidence)) AS affinity,
    coalesce(m.utility, 0.2) AS utility,
    coalesce(m.confidence, 0.7) AS confidence,
    exp(
      -
      (CASE
          WHEN
            duration.inSeconds(coalesce(m.updatedAt, now), now).seconds < 0
            THEN 0
          ELSE duration.inSeconds(coalesce(m.updatedAt, now), now).seconds
        END) /
      (14.0 * 24 * 3600.0)) AS recency,
    coalesce(m.tags, []) AS mTags,
    [t IN qTags WHERE t IN coalesce(m.tags, [])] AS tMatched

  // --- split tagScore and fixScore into separate WITH clauses (Cypher rule) ---
  WITH
    m,
    caseContribution,
    affinity,
    utility,
    confidence,
    recency,
    qTags,
    mTags,
    tMatched,
    fixLimit,
    CASE
      WHEN size(qTags) = 0 OR size(mTags) = 0 THEN 0.0
      ELSE
        (1.0 * size(tMatched)) /
        toFloat(size(qTags) + size(mTags) - size(tMatched))
    END AS tagScore

  WITH
    m,
    fixLimit,
    (0.42 * caseContribution +
      0.20 * affinity +
      0.13 * utility +
      0.13 * confidence +
      0.05 * recency +
      0.07 * tagScore) AS fixScore
  ORDER BY fixScore DESC
  WITH
    collect(
      DISTINCT m {
        .id,
        .kind,
        .polarity,
        .title,
        .content,
        .summary,
        .whenToUse,
        .howToApply,
        .gotchas,
        .scopeRepo,
        .scopePackage,
        .scopeModule,
        .scopeRuntime,
        .scopeVersions,
        .evidence,
        .outcome,
        .validFrom,
        .validTo,
        .utility,
        .confidence,
        .updatedAt,
        tags: coalesce(m.tags, [])
      }) AS collected,
    fixLimit
  WITH [x IN collected WHERE x IS NOT NULL][0..fixLimit] AS fixes
  RETURN fixes AS fixes
}

// 3) Retrieve DO-NOT-DO memories from top cases.
CALL (
  now,
  qTags,
  topCases,
  topScores,
  aMin,
  bMin,
  affK,
  agentId,
  halfLifeSeconds,
  dontLimit,
  fixes
) {
  WITH
    now,
    qTags,
    topCases,
    topScores,
    aMin,
    bMin,
    affK,
    agentId,
    halfLifeSeconds,
    dontLimit,
    fixes
  WITH
    now,
    qTags,
    topCases,
    topScores,
    aMin,
    bMin,
    affK,
    agentId,
    halfLifeSeconds,
    dontLimit,
    fixes,
    CASE
      WHEN size(topCases) = 0 THEN [null]
      ELSE range(0, size(topCases) - 1)
    END AS idxs
  UNWIND idxs AS j
  WITH
    now,
    qTags,
    aMin,
    bMin,
    affK,
    agentId,
    halfLifeSeconds,
    dontLimit,
    fixes,
    CASE
      WHEN j IS NULL THEN null
      ELSE topCases[j]
    END AS c2,
    CASE
      WHEN j IS NULL THEN 0.0
      ELSE topScores[j]
    END AS cs2

  OPTIONAL MATCH (c2)-[hn]->(n:Memory)
  WHERE type(hn) = "HAS_NEGATIVE" AND coalesce(n.polarity, "negative") = "negative"
  WITH
    now,
    qTags,
    aMin,
    bMin,
    affK,
    agentId,
    halfLifeSeconds,
    dontLimit,
    fixes,
    n,
    max(cs2) AS caseContribution2

  OPTIONAL MATCH (a:Agent {id: agentId})-[r2]->(n)
  WHERE type(r2) = "RECALLS"
  WITH
    now,
    qTags,
    aMin,
    bMin,
    affK,
    halfLifeSeconds,
    dontLimit,
    fixes,
    n,
    caseContribution2,
    CASE
      WHEN
        duration.inSeconds(coalesce(r2.updatedAt, now), now).seconds < 0
        THEN 0
      ELSE duration.inSeconds(coalesce(r2.updatedAt, now), now).seconds
    END AS dt2,
    coalesce(
      r2.a,
      CASE
        WHEN aMin > coalesce(r2.strength, 0.5) * 2.0 THEN aMin
        ELSE coalesce(r2.strength, 0.5) * 2.0
      END
    ) AS aPrev2,
    coalesce(
      r2.b,
      CASE
        WHEN bMin > (1.0 - coalesce(r2.strength, 0.5)) * 2.0 THEN bMin
        ELSE (1.0 - coalesce(r2.strength, 0.5)) * 2.0
      END
    ) AS bPrev2

  WITH
    now,
    qTags,
    aMin,
    bMin,
    affK,
    dontLimit,
    fixes,
    n,
    caseContribution2,
    aPrev2,
    bPrev2,
    0.5 ^ (dt2 / halfLifeSeconds) AS gamma2

  WITH
    now,
    qTags,
    aMin,
    bMin,
    affK,
    dontLimit,
    fixes,
    n,
    caseContribution2,
    (aMin + gamma2 * (aPrev2 - aMin)) AS a02,
    (bMin + gamma2 * (bPrev2 - bMin)) AS b02

  WITH
    now,
    qTags,
    affK,
    dontLimit,
    fixes,
    n,
    caseContribution2,
    (CASE
        WHEN (a02 + b02) <= 0 THEN 0.0
        ELSE a02 / (a02 + b02)
      END) AS affinityMean2,
    (a02 + b02) AS affinityEvidence2

  WITH
    now,
    qTags,
    dontLimit,
    fixes,
    n,
    caseContribution2,
    affinityMean2 * (1 - exp(- affK * affinityEvidence2)) AS affinity2,
    coalesce(n.utility, 0.2) AS utility2,
    coalesce(n.confidence, 0.7) AS confidence2,
    exp(
      -
      (CASE
          WHEN
            duration.inSeconds(coalesce(n.updatedAt, now), now).seconds < 0
            THEN 0
          ELSE duration.inSeconds(coalesce(n.updatedAt, now), now).seconds
        END) /
      (21.0 * 24 * 3600.0)) AS recency2,
    coalesce(n.tags, []) AS nTags,
    [t IN qTags WHERE t IN coalesce(n.tags, [])] AS tMatched2

  // --- split tagScore2 and dontScore into separate WITH clauses (Cypher rule) ---
  WITH
    fixes,
    n,
    caseContribution2,
    affinity2,
    utility2,
    confidence2,
    recency2,
    qTags,
    nTags,
    tMatched2,
    dontLimit,
    CASE
      WHEN size(qTags) = 0 OR size(nTags) = 0 THEN 0.0
      ELSE
        (1.0 * size(tMatched2)) /
        toFloat(size(qTags) + size(nTags) - size(tMatched2))
    END AS tagScore2

  WITH
    fixes,
    n,
    dontLimit,
    (0.48 * caseContribution2 +
      0.15 * affinity2 +
      0.10 * utility2 +
      0.15 * confidence2 +
      0.05 * recency2 +
      0.07 * tagScore2) AS dontScore
  ORDER BY dontScore DESC
  WITH
    collect(
      DISTINCT n {
        .id,
        .kind,
        .polarity,
        .title,
        .content,
        .summary,
        .whenToUse,
        .howToApply,
        .gotchas,
        .scopeRepo,
        .scopePackage,
        .scopeModule,
        .scopeRuntime,
        .scopeVersions,
        .evidence,
        .outcome,
        .validFrom,
        .validTo,
        .utility,
        .confidence,
        .updatedAt,
        tags: coalesce(n.tags, [])
      }) AS collected,
    dontLimit,
    fixes

  WITH fixes, [x IN collected WHERE x IS NOT NULL][0..dontLimit] AS doNot
  RETURN doNot AS doNot

}

RETURN {fixes: fixes, doNot: doNot} AS sections;
