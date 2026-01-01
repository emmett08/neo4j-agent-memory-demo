import neo4j, { Driver, Session } from "neo4j-driver";

export interface Neo4jClientConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export class Neo4jClient {
  private driver: Driver;
  private database?: string;

  constructor(cfg: Neo4jClientConfig) {
    this.driver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.username, cfg.password));
    this.database = cfg.database;
  }

  session(mode: "READ" | "WRITE" = "READ"): Session {
    return this.driver.session({
      database: this.database,
      defaultAccessMode: mode === "READ" ? neo4j.session.READ : neo4j.session.WRITE,
    });
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
