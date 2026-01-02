import neo4j from "neo4j-driver";
import { exitWithError } from "./utils/errors.js";

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
    // Check RESOLVED_BY relationships
    console.log("\n=== RESOLVED_BY Relationships ===");
    const resolvedByResult = await session.run(
      "MATCH (:Case)-[r:RESOLVED_BY]->(:Memory) RETURN count(r) AS resolvedByRels"
    );
    console.log("Total RESOLVED_BY relationships:", resolvedByResult.records[0].get("resolvedByRels").toNumber());

    // Check each case
    console.log("\n=== Cases and their RESOLVED_BY relationships ===");
    const casesResult = await session.run(`
      MATCH (c:Case)
      OPTIONAL MATCH (c)-[r:RESOLVED_BY]->(m:Memory)
      RETURN c.id, c.title, count(r) AS resolvedByCount, collect(m.id) AS memoryIds
      ORDER BY c.id
    `);
    
    for (const record of casesResult.records) {
      const caseId = record.get("c.id");
      const title = record.get("c.title");
      const count = record.get("resolvedByCount").toNumber();
      const memoryIds = record.get("memoryIds");
      console.log(`\n${caseId}: ${title}`);
      console.log(`  RESOLVED_BY count: ${count}`);
      console.log(`  Memory IDs: ${memoryIds.join(", ") || "(none)"}`);
    }

    // Check HAS_NEGATIVE relationships
    console.log("\n\n=== HAS_NEGATIVE Relationships ===");
    const negativeResult = await session.run(
      "MATCH (:Case)-[r:HAS_NEGATIVE]->(:Memory) RETURN count(r) AS negativeRels"
    );
    console.log("Total HAS_NEGATIVE relationships:", negativeResult.records[0].get("negativeRels").toNumber());

    // Check all Memory nodes
    console.log("\n\n=== All Memory nodes ===");
    const memoriesResult = await session.run(
      "MATCH (m:Memory) RETURN m.id, m.title ORDER BY m.id"
    );
    console.log(`Total memories: ${memoriesResult.records.length}`);
    for (const record of memoriesResult.records) {
      console.log(`  - ${record.get("m.id")}: ${record.get("m.title")}`);
    }

  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(exitWithError);
