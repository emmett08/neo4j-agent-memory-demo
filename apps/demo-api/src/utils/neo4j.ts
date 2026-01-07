import { Neo4jClient } from "@neuralsea/neo4j-agent-memory";
import { envOrDefault, envOrThrow } from "./env.js";

export function createNeo4jClientFromEnv(): Neo4jClient {
  return new Neo4jClient({
    uri: envOrThrow("NEO4J_URI"),
    username: envOrThrow("NEO4J_USER"),
    password: envOrThrow("NEO4J_PASSWORD"),
    database: envOrDefault("NEO4J_DATABASE", "neo4j"),
  });
}
