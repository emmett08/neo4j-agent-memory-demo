import { Neo4jClient } from "./client.js";
import { cypher } from "../cypher/index.js";

export const schemaVersion = 1;

export async function ensureSchema(client: Neo4jClient): Promise<void> {
  const session = client.session("WRITE");
  try {
    // Split on semicolons, run each statement
    const statements = cypher.schema.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await session.run(stmt);
    }
  } finally {
    await session.close();
  }
}

export async function migrate(client: Neo4jClient, targetVersion = schemaVersion): Promise<void> {
  if (targetVersion !== schemaVersion) {
    throw new Error(`Unsupported schema version ${targetVersion}; current is ${schemaVersion}`);
  }
  await ensureSchema(client);
}
