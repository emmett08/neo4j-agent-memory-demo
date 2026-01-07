import { exitWithError } from "./utils/errors.js";
import { createNeo4jClientFromEnv } from "./utils/neo4j.js";

async function main() {
  const client = createNeo4jClientFromEnv();
  const session = client.session("WRITE");
  
  try {
    console.log("Clearing all nodes and relationships...");
    await session.run("MATCH (n) DETACH DELETE n");
    console.log("✅ Database cleared!");
  } finally {
    await session.close();
    await client.close();
  }
}

main().catch(exitWithError);
