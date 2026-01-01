import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryService, type LearningCandidate, type CaseRecord } from "neo4j-agent-memory";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(here, "..", "seed", "uxui_memories.json");

function normaliseCase(c: any): CaseRecord {
  return {
    id: c.id,
    title: c.title,
    summary: c.summary,
    outcome: c.outcome,
    symptoms: c.symptoms ?? [],
    env: c.env ?? {},
    resolvedByMemoryIds: c.resolvedByMemoryIds ?? [],
    negativeMemoryIds: c.negativeMemoryIds ?? [],
    resolvedAtIso: c.resolvedAtIso ?? null
  };
}

async function main() {
  const raw = JSON.parse(await readFile(seedPath, "utf8"));

  console.log("Creating memory service...");
  const mem = await createMemoryService({
    neo4j: {
      uri: envOrThrow("NEO4J_URI"),
      username: envOrThrow("NEO4J_USER"),
      password: envOrThrow("NEO4J_PASSWORD"),
    },
  });
  console.log("Memory service created and initialized");

  // Test database connection
  const testSession = (mem as any).client.session("WRITE");
  try {
    const result = await testSession.run("CREATE (n:TestNode {id: 'test'}) RETURN n");
    console.log("Test node created:", result.records.length);
    const countResult = await testSession.run("MATCH (n:TestNode) RETURN count(n) AS count");
    console.log("Test node count:", countResult.records[0].get("count").toNumber());
    await testSession.run("MATCH (n:TestNode) DELETE n");
    console.log("Test node deleted");
  } finally {
    await testSession.close();
  }

  // Save memories (distilled, with gates)
  const learnings: LearningCandidate[] = raw.memories;
  console.log(`Saving ${learnings.length} learnings...`);
  const saveRes = await mem.saveLearnings({
    agentId: "seed",
    learnings,
    policy: { minConfidence: 0.7, requireVerificationSteps: true, maxItems: 50 }
  });
  console.log("Saved memories:", saveRes.saved.length, "Rejected:", saveRes.rejected.length);
  if (saveRes.rejected.length) console.log(saveRes.rejected);

  // Create cases and link to saved negative/fix memories by title matching (simple demo)
  // In real use, you'd capture memory ids directly.
  const titleToId = new Map<string,string>();
  for (const s of saveRes.saved) titleToId.set(s.title, s.id);

  const fixed1 = titleToId.get("UX: Structure a prompt builder UI for agent memory injection");
  const neg1 = titleToId.get("Anti-pattern: Auto-running agent on every keystroke");
  const neg2 = titleToId.get("Anti-pattern: Hiding validation errors in a toast only");

  // Episodic memories
  const episodic1 = titleToId.get("Session 2024-12-15: Successfully debugged React 19 hydration mismatch");
  const episodic2 = titleToId.get("Session 2024-11-28: Auto-refresh caused 500+ unnecessary API calls");
  const episodic3 = titleToId.get("Session 2024-12-10: User testing revealed chip input confusion");
  const episodic4 = titleToId.get("Session 2024-12-05: Toast-only errors caused 40% form abandonment");

  // npm EACCES case memories
  const npmFix = titleToId.get("Fix npm EACCES permission denied on macOS");
  const npmEpisode = titleToId.get("Session 2024-12-22: Resolved npm EACCES by changing npm prefix");
  const npmAntiPattern = titleToId.get("Anti-pattern: Using sudo with npm on macOS/Linux");

  const cases: any[] = raw.cases ?? [];
  for (const c of cases) {
    const cc = normaliseCase(c);
    if (cc.id === "case_ui_prompt_builder_001") {
      cc.resolvedByMemoryIds = fixed1 ? [fixed1] : [];
      cc.negativeMemoryIds = neg1 ? [neg1] : [];
    }
    if (cc.id === "case_ui_errors_001") {
      cc.negativeMemoryIds = neg2 ? [neg2] : [];
      // Also link the episodic memory about the same issue
      if (episodic4) cc.resolvedByMemoryIds = [episodic4];
    }
    if (cc.id === "case_react19_hydration_001") {
      cc.resolvedByMemoryIds = episodic1 ? [episodic1] : [];
    }
    if (cc.id === "case_auto_refresh_cost_001") {
      cc.resolvedByMemoryIds = episodic2 ? [episodic2] : [];
      cc.negativeMemoryIds = episodic2 ? [episodic2] : [];
    }
    if (cc.id === "case_chip_keyboard_ux_001") {
      cc.resolvedByMemoryIds = episodic3 ? [episodic3] : [];
    }
    if (cc.id === "case_npm_eacces_macos_001") {
      cc.resolvedByMemoryIds = [npmFix, npmEpisode].filter(Boolean);
      cc.negativeMemoryIds = npmAntiPattern ? [npmAntiPattern] : [];
    }
    console.log(`Upserting case: ${cc.id}`);
    await mem.upsertCase(cc);
  }
  console.log("Seeded cases:", cases.length);

  console.log("Closing memory service...");
  await mem.close();
  console.log("Done!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
