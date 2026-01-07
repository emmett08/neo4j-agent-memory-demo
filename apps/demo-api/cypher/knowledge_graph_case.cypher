// Case-centric graph: symptoms, environment, fixes, and negatives.

// :param { caseId: "case_npm_eacces_macos_001", limit: 200 }
WITH
  coalesce($caseId, "case_npm_eacces_macos_001") AS caseId,
  toInteger(coalesce($limit, 200)) AS limit

MATCH (c:Case {id: caseId})
OPTIONAL MATCH pSym = (c)-[:HAS_SYMPTOM]->(:Symptom)
OPTIONAL MATCH pEnv = (c)-[:IN_ENV]->(:EnvironmentFingerprint)
OPTIONAL MATCH pFix = (c)-[:RESOLVED_BY]->(:Memory)
OPTIONAL MATCH pNeg = (c)-[:HAS_NEGATIVE]->(:Memory)
RETURN pSym, pEnv, pFix, pNeg
LIMIT toInteger(coalesce($limit, 200));
