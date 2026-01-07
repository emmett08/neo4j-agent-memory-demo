import type { Neo4jClient } from "../../neo4j/client.js";

export type Neo4jClientProvider = () => Neo4jClient;

export abstract class Neo4jRepositoryBase {
  constructor(protected getClient: Neo4jClientProvider) {}

  protected client(): Neo4jClient {
    return this.getClient();
  }
}

