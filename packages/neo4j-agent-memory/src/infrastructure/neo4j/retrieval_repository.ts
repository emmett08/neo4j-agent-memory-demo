import type { RetrieveContextArgs } from "../../types.js";
import { cypher } from "../../cypher/index.js";
import { Neo4jRepositoryBase } from "./repository_base.js";

export class Neo4jRetrievalRepository extends Neo4jRepositoryBase {
  async retrieveContextBundle(params: Record<string, any>): Promise<any> {
    const session = this.client().session("READ");
    try {
      const r = await session.run(cypher.retrieveContextBundle, params);
      return r.records[0].get("sections");
    } finally {
      await session.close();
    }
  }

  async fallbackRetrieveMemories(params: Record<string, any>): Promise<any> {
    const session = this.client().session("READ");
    try {
      const r = await session.run(cypher.fallbackRetrieveMemories, params);
      return r.records[0]?.get("sections");
    } finally {
      await session.close();
    }
  }

  async getRecallEdges(agentId: string, ids: string[]): Promise<Map<string, any>> {
    const session = this.client().session("READ");
    try {
      const cyGetRecallEdges = `
        UNWIND $ids AS id
        MATCH (m:Memory {id:id})
        OPTIONAL MATCH (a:Agent {id:$agentId})-[r:RECALLS]->(m)
        RETURN id AS id,
               r.a AS a,
               r.b AS b,
               r.strength AS strength,
               r.evidence AS evidence,
               toString(r.updatedAt) AS updatedAt
      `;
      const res = await session.run(cyGetRecallEdges, { agentId, ids });
      const out = new Map<string, any>();
      for (const rec of res.records) {
        const id = rec.get("id") as string;
        out.set(id, {
          a: rec.get("a"),
          b: rec.get("b"),
          strength: rec.get("strength"),
          evidence: rec.get("evidence"),
          updatedAt: rec.get("updatedAt"),
        });
      }
      return out;
    } finally {
      await session.close();
    }
  }
}

