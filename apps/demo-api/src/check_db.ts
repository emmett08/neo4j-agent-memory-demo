import { createMemoryService } from "neo4j-agent-memory";
import { exitWithError } from "./utils/errors.js";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function main() {
  const mem = await createMemoryService({
    neo4j: {
      uri: envOrThrow("NEO4J_URI"),
      username: envOrThrow("NEO4J_USER"),
      password: envOrThrow("NEO4J_PASSWORD"),
    },
  });

  // Check what's in the database
  const session = (mem as any).client.session("READ");
  
  try {
    // Check labels
    const labels = await session.run("CALL db.labels() YIELD label RETURN label");
    console.log("\n=== Labels in database ===");
    labels.records.forEach((r: { get: (key: string) => string }) => console.log("  -", r.get("label")));
    
    // Check relationship types
    const rels = await session.run("CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType");
    console.log("\n=== Relationship types ===");
    rels.records.forEach((r: { get: (key: string) => string }) => console.log("  -", r.get("relationshipType")));
    
    // Count nodes
    const counts = await session.run(`
      MATCH (n)
      RETURN labels(n)[0] AS label, count(*) AS count
      ORDER BY count DESC
    `);
    console.log("\n=== Node counts ===");
    counts.records.forEach((r: { get: (key: string) => string | number }) =>
      console.log(`  ${r.get("label")}: ${r.get("count")}`)
    );
    
    // Show memories by kind
    const byKind = await session.run(`
      MATCH (m:Memory)
      RETURN m.kind AS kind, count(*) AS count
      ORDER BY count DESC
    `);
    console.log("\n=== Memories by kind ===");
    byKind.records.forEach((r: { get: (key: string) => string | number }) =>
      console.log(`  ${r.get("kind")}: ${r.get("count")}`)
    );

    // Show episodic memories
    const episodic = await session.run("MATCH (m:Memory {kind: 'episodic'}) RETURN m ORDER BY m.createdAt DESC");
    console.log("\n=== Episodic memories ===");
    episodic.records.forEach((r: { get: (key: string) => { properties: { title: string; polarity: string; confidence: number } } }) => {
      const m = r.get("m").properties;
      console.log(`  - ${m.title}`);
      console.log(`    Polarity: ${m.polarity}, Confidence: ${m.confidence}`);
    });

    // Show cases with their linked memories
    const casesWithMemories = await session.run(`
      MATCH (c:Case)
      OPTIONAL MATCH (c)-[:RESOLVED_BY]->(fix:Memory)
      OPTIONAL MATCH (c)-[:HAS_NEGATIVE]->(neg:Memory)
      WITH c, collect(DISTINCT fix.title) AS fixes, collect(DISTINCT neg.title) AS negatives
      RETURN c.title AS caseTitle, fixes, negatives
      ORDER BY caseTitle
    `);
    console.log("\n=== Cases with linked memories ===");
    casesWithMemories.records.forEach((r: { get: (key: string) => string[] | string }) => {
      console.log(`\n  Case: ${r.get("caseTitle")}`);
      const fixes = (r.get("fixes") as string[]).filter((f: string) => Boolean(f));
      const negatives = (r.get("negatives") as string[]).filter((n: string) => Boolean(n));
      if (fixes.length > 0) {
        console.log(`    ✅ Fixes: ${fixes.join(", ")}`);
      }
      if (negatives.length > 0) {
        console.log(`    ❌ Negatives: ${negatives.join(", ")}`);
      }
    });
    
  } finally {
    await session.close();
  }

  await mem.close();
}

main().catch(exitWithError);
