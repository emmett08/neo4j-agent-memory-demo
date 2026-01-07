import type { CaseRecord } from "../../types.js";
import { cypher } from "../../cypher/index.js";
import { Neo4jRepositoryBase } from "./repository_base.js";

export class Neo4jCaseRepository extends Neo4jRepositoryBase {
  async upsertCase(params: Record<string, any>): Promise<string> {
    const session = this.client().session("WRITE");
    try {
      const res = await session.run(cypher.upsertCase, params);
      return res.records[0].get("caseId");
    } finally {
      await session.close();
    }
  }

  async upsertCaseFromRecord(c: CaseRecord, normalisedSymptoms: string[], env: any): Promise<string> {
    return this.upsertCase({
      caseId: c.id,
      title: c.title,
      summary: c.summary,
      outcome: c.outcome,
      symptoms: normalisedSymptoms,
      env,
      resolvedByMemoryIds: c.resolvedByMemoryIds ?? [],
      negativeMemoryIds: c.negativeMemoryIds ?? [],
      resolvedAtIso: c.resolvedAtIso ?? null,
    });
  }
}

