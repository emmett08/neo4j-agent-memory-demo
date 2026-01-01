import neo4j from "neo4j-driver";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function main() {
  const driver = neo4j.driver(
    envOrThrow("NEO4J_URI"),
    neo4j.auth.basic(envOrThrow("NEO4J_USER"), envOrThrow("NEO4J_PASSWORD"))
  );

  const session = driver.session();
  
  try {
    console.log("Clearing all nodes and relationships...");
    await session.run("MATCH (n) DETACH DELETE n");
    console.log("✅ Database cleared!");
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);

