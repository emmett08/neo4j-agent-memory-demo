import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Neo4jClient } from "./client.js";

function loadCypher(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const p = path.resolve(here, "cypher", rel);
  return readFileSync(p, "utf8");
}

export async function ensureSchema(client: Neo4jClient): Promise<void> {
  const cy = loadCypher("schema.cypher");
  const session = client.session("WRITE");
  try {
    // Split on semicolons, run each statement
    const statements = cy.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await session.run(stmt);
    }
  } finally {
    await session.close();
  }
}
