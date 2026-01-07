import type {
  GetKnowledgeGraphByTagsArgs,
  GetMemoriesByIdArgs,
  GetMemoryGraphArgs,
  KnowledgeGraphResponse,
  ListMemoriesArgs,
  ListMemoryEdgesArgs,
  MemoryEdgeExport,
  MemoryGraphResponse,
  MemoryRecord,
  MemorySummary,
  SearchMemoriesArgs,
  SearchMemorySummary,
} from "../../types.js";
import { cypher } from "../../cypher/index.js";
import { toMemoryRecord } from "../../domain/mappers.js";
import { Neo4jRepositoryBase } from "./repository_base.js";

export class Neo4jMemoryRepository extends Neo4jRepositoryBase {
  async findMemoryIdByContentHash(contentHash: string): Promise<string | null> {
    const session = this.client().session("READ");
    try {
      const existing = await session.run("MATCH (m:Memory {contentHash: $h}) RETURN m.id AS id LIMIT 1", { h: contentHash });
      if (existing.records.length === 0) return null;
      return existing.records[0].get("id");
    } finally {
      await session.close();
    }
  }

  async upsertMemory(params: Record<string, any>): Promise<void> {
    const session = this.client().session("WRITE");
    try {
      await session.run(cypher.upsertMemory, params);
    } finally {
      await session.close();
    }
  }

  async attachEnvToMemory(params: Record<string, any>): Promise<void> {
    const session = this.client().session("WRITE");
    try {
      await session.run(
        `MERGE (e:EnvironmentFingerprint {hash:$hash})
         ON CREATE SET e.os=$os, e.distro=$distro, e.ci=$ci, e.container=$container,
                       e.filesystem=$filesystem, e.workspaceMount=$workspaceMount,
                       e.nodeVersion=$nodeVersion, e.packageManager=$packageManager, e.pmVersion=$pmVersion
         WITH e
         MATCH (m:Memory {id:$id})
         MERGE (m)-[:APPLIES_IN]->(e)`,
        params
      );
    } finally {
      await session.close();
    }
  }

  async autoRelateByTags(params: Record<string, any>): Promise<void> {
    const session = this.client().session("WRITE");
    try {
      await session.run(cypher.autoRelateByTags, params);
    } finally {
      await session.close();
    }
  }

  async listMemories(args: ListMemoriesArgs = {}): Promise<MemorySummary[]> {
    const session = this.client().session("READ");
    try {
      const res = await session.run(cypher.listMemories, {
        kind: args.kind ?? null,
        limit: args.limit ?? 25,
        agentId: args.agentId ?? null,
      });
      const memories = (res.records[0]?.get("memories") as any[]) ?? [];
      return memories.map((m) => ({
        id: m.id,
        kind: m.kind,
        polarity: m.polarity ?? "positive",
        title: m.title,
        tags: m.tags ?? [],
        confidence: m.confidence ?? 0.7,
        utility: m.utility ?? 0.2,
        createdAt: m.createdAt?.toString?.() ?? null,
        updatedAt: m.updatedAt?.toString?.() ?? null,
      }));
    } finally {
      await session.close();
    }
  }

  async searchMemories(args: SearchMemoriesArgs, fulltextIndex: string): Promise<SearchMemorySummary[]> {
    const q = (args.query ?? "").trim();
    if (!q) return [];
    const tags = [...new Set((args.tags ?? []).map((t) => t?.trim?.() ?? String(t)).filter(Boolean))];
    const scope = args.scope ?? {};
    const session = this.client().session("READ");
    try {
      const res = await session.run(cypher.searchMemories, {
        query: q,
        fulltextIndex,
        tags,
        kind: args.kind ?? null,
        outcome: args.outcome ?? null,
        scopeRepo: scope.repo ?? null,
        scopePackage: scope.package ?? null,
        scopeModule: scope.module ?? null,
        scopeRuntime: scope.runtime ?? null,
        scopeVersions: scope.versions ?? null,
        topK: args.topK ?? 20,
      });
      const rows = (res.records[0]?.get("results") as any[]) ?? [];
      return rows.map((r: any) => ({
        id: r.id,
        kind: r.kind,
        polarity: r.polarity ?? "positive",
        title: r.title,
        tags: r.tags ?? [],
        confidence: r.confidence ?? 0.7,
        utility: r.utility ?? 0.2,
        createdAt: r.createdAt?.toString?.() ?? null,
        updatedAt: r.updatedAt?.toString?.() ?? null,
        score: r.score ?? 0.0,
      }));
    } finally {
      await session.close();
    }
  }

  async getMemoriesById(args: GetMemoriesByIdArgs): Promise<MemoryRecord[]> {
    const ids = [...new Set((args.ids ?? []).filter(Boolean))];
    if (ids.length === 0) return [];
    const session = this.client().session("READ");
    try {
      const res = await session.run(cypher.getMemoriesById, { ids });
      const memories = (res.records[0]?.get("memories") as any[]) ?? [];
      return memories.map(toMemoryRecord);
    } finally {
      await session.close();
    }
  }

  async getMemoryGraph(args: GetMemoryGraphArgs): Promise<MemoryGraphResponse> {
    const ids = [...new Set((args.memoryIds ?? []).filter(Boolean))];
    if (ids.length === 0) return { nodes: [], edges: [] };
    const session = this.client().session("READ");
    try {
      const res = await session.run(cypher.getMemoryGraph, {
        agentId: args.agentId ?? null,
        memoryIds: ids,
        includeNodes: args.includeNodes ?? true,
        includeRelatedTo: args.includeRelatedTo ?? false,
      });
      const record = res.records[0];
      const nodesRaw = (record?.get("nodes") as any[]) ?? [];
      const edges = (record?.get("edges") as any[]) ?? [];
      return { nodes: nodesRaw.map(toMemoryRecord), edges };
    } finally {
      await session.close();
    }
  }

  async getKnowledgeGraphByTags(args: GetKnowledgeGraphByTagsArgs): Promise<KnowledgeGraphResponse> {
    const tags = [...new Set((args.tags ?? []).map((t) => t?.trim?.() ?? String(t)).filter(Boolean))];
    const session = this.client().session("READ");
    try {
      const res = await session.run(cypher.getKnowledgeGraphByTags, {
        tags,
        limit: args.limit ?? 50,
        minStrength: args.minStrength ?? 0.0,
        includeNodes: args.includeNodes ?? true,
      });
      const record = res.records[0];
      const query = (record?.get("query") as any) ?? { id: "tag_query", tags: [] };
      const nodesRaw = (record?.get("nodes") as any[]) ?? [];
      const edges = (record?.get("edges") as any[]) ?? [];
      return { query, nodes: nodesRaw.map(toMemoryRecord), edges };
    } finally {
      await session.close();
    }
  }

  async listMemoryEdges(args: ListMemoryEdgesArgs = {}): Promise<MemoryEdgeExport[]> {
    const session = this.client().session("READ");
    try {
      const res = await session.run(cypher.listMemoryEdges, {
        limit: args.limit ?? 200,
        minStrength: args.minStrength ?? 0.0,
      });
      return (res.records[0]?.get("edges") as any[]) ?? [];
    } finally {
      await session.close();
    }
  }

  async relateConcepts(args: { a: string; b: string; weight: number }): Promise<void> {
    const session = this.client().session("WRITE");
    try {
      await session.run(cypher.relateConcepts, { a: args.a, b: args.b, weight: args.weight });
    } finally {
      await session.close();
    }
  }
}
