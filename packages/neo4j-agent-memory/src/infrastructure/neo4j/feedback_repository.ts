import { cypher } from "../../cypher/index.js";
import { Neo4jRepositoryBase } from "./repository_base.js";

export class Neo4jFeedbackRepository extends Neo4jRepositoryBase {
  async ensureAgent(agentId: string): Promise<void> {
    const session = this.client().session("WRITE");
    try {
      await session.run("MERGE (a:Agent {id:$id}) RETURN a", { id: agentId });
    } finally {
      await session.close();
    }
  }

  async applyFeedbackBatch(params: Record<string, any>): Promise<any[]> {
    const session = this.client().session("WRITE");
    try {
      const res = await session.run(cypher.feedbackBatch, params);
      return res.records;
    } finally {
      await session.close();
    }
  }

  async applyCoUsedPairs(params: Record<string, any>): Promise<void> {
    const session = this.client().session("WRITE");
    try {
      await session.run(cypher.feedbackCoUsed, params);
    } finally {
      await session.close();
    }
  }

  async link(fromId: string, relType: string, toId: string, props: Record<string, any>): Promise<void> {
    const session = this.client().session("WRITE");
    try {
      const q = `
        MATCH (a {id:$fromId})
        MATCH (b {id:$toId})
        MERGE (a)-[r:${relType}]->(b)
        ON CREATE SET r.createdAt = datetime()
        SET r.updatedAt = datetime(), r += $props
        RETURN 1 AS ok
      `;
      await session.run(q, { fromId, toId, props });
    } finally {
      await session.close();
    }
  }
}

