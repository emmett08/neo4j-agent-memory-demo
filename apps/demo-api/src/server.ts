import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { createMemoryService, createMemoryTools, type MemoryEvent } from "@neural/neo4j-agent-memory";
import { tool, ToolLoopAgent } from "ai";
import { openai } from "@ai-sdk/openai";
import { Auggie } from "@augmentcode/auggie-sdk";
import { listBaseSchema, listSchema, filterPatterns } from "./memory_routes.js";
import { resolveAgentProvider } from "./agent_provider.js";
import { envOrThrow } from "./utils/env.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.PORT ?? 8080);
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_AUGGIE_MODEL = "sonnet4.5";

type MemoryEventListener = (event: MemoryEvent) => void;

const memoryEventListeners = new Set<MemoryEventListener>();

function addMemoryEventListener(listener: MemoryEventListener): () => void {
  memoryEventListeners.add(listener);
  return () => memoryEventListeners.delete(listener);
}

memoryEventListeners.add((event) => {
  const meta = event.meta ? JSON.stringify(event.meta) : "";
  console.log(`[MEMORY:${event.type}] ${event.action} ${meta}`);
});

const memPromise = createMemoryService({
  neo4j: {
    uri: envOrThrow("NEO4J_URI"),
    username: envOrThrow("NEO4J_USER"),
    password: envOrThrow("NEO4J_PASSWORD"),
  },
  onMemoryEvent: (event) => {
    for (const listener of memoryEventListeners) {
      listener(event);
    }
  },
});

app.get("/health", async (_req, res) => {
  res.json({ ok: true });
});

const retrieveSchema = z.object({
  agentId: z.string().default("Auggie"),
  prompt: z.string(),
  symptoms: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  env: z.record(z.string(), z.any()).optional(),
  // Optional baseline of Beta posteriors keyed by memoryId
  baseline: z.record(z.string(), z.object({ a: z.number(), b: z.number() })).optional(),
  caseLimit: z.number().int().min(1).max(10).optional(),
  fixLimit: z.number().int().min(1).max(20).optional(),
  dontLimit: z.number().int().min(1).max(20).optional(),
});

app.post("/memory/retrieve", async (req, res) => {
  let auggieClient: Auggie | null = null;

  try {
    const body = retrieveSchema.parse(req.body);
    const mem = await memPromise;

    const bundle = await mem.retrieveContextBundle({
      agentId: body.agentId,
      prompt: body.prompt,
      symptoms: body.symptoms,
      tags: body.tags,
      env: body.env as any,
      baseline: body.baseline as any,
      caseLimit: body.caseLimit,
      fixLimit: body.fixLimit,
      dontLimit: body.dontLimit,
    });

    res.json(bundle);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

const feedbackSchema = z.object({
  agentId: z.string().default("Auggie"),
  sessionId: z.string(),
  usedIds: z.array(z.string()).default([]),
  usefulIds: z.array(z.string()).default([]),
  notUsefulIds: z.array(z.string()).default([]),
  preventedErrorIds: z.array(z.string()).optional(),
});

app.post("/memory/feedback", async (req, res) => {
  try {
    const body = feedbackSchema.parse(req.body);
    const mem = await memPromise;

    console.log("\n" + "=".repeat(80));
    console.log("📊 USER FEEDBACK (Manual)");
    console.log("=".repeat(80));
    console.log(`Agent ID: ${body.agentId}`);
    console.log(`Session ID: ${body.sessionId}`);
    console.log(`Used IDs: [${body.usedIds.join(', ')}]`);
    console.log(`Useful IDs: [${body.usefulIds.join(', ')}]`);
    console.log(`Not Useful IDs: [${body.notUsefulIds.join(', ')}]`);
    console.log("=".repeat(80) + "\n");

    await mem.feedback(body as any);

    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

app.post("/memory/list", async (req, res) => {
  try {
    const body = listSchema.parse(req.body);
    const mem = await memPromise;
    const items = await mem.listMemories(body);
    res.json({ items });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

app.post("/memory/skills", async (req, res) => {
  try {
    const body = listBaseSchema.parse(req.body);
    const mem = await memPromise;
    const items = await mem.listSkills(body);
    res.json({ items });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

app.post("/memory/concepts", async (req, res) => {
  try {
    const body = listBaseSchema.parse(req.body);
    const mem = await memPromise;
    const items = await mem.listConcepts(body);
    res.json({ items });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

app.post("/memory/episodes", async (req, res) => {
  try {
    const body = listBaseSchema.parse(req.body);
    const mem = await memPromise;
    const items = await mem.listEpisodes(body);
    res.json({ items });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

app.post("/memory/patterns", async (req, res) => {
  try {
    const body = listBaseSchema.parse(req.body);
    const mem = await memPromise;
    const items = await mem.listConcepts(body);
    res.json({ items: filterPatterns(items) });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

const runSchema = z.object({
  agentId: z.string().default("Auggie"),
  prompt: z.string(),
  symptoms: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  env: z.record(z.string(), z.any()).optional(),
});

const agentRunHandler = async (req: express.Request, res: express.Response) => {
  const body = runSchema.parse(req.body);
  const mem = await memPromise;
  const runId = `run_${randomUUID()}`;

  // tools: allow mid-run memory retrieval and saving
  const memory_get_context = tool({
    description:
      "Retrieve relevant memories for the current task. Returns Fix and Do-not-do sections. Use [MEM:id] citations when applying.",
    inputSchema: z.object({
      agentId: z.string(),
      prompt: z.string(),
      symptoms: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      env: z.record(z.string(), z.any()).optional(),
      caseLimit: z.number().int().min(1).max(10).optional(),
      fixLimit: z.number().int().min(1).max(20).optional(),
      dontLimit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async (args) => {
      console.log("\n" + "=".repeat(80));
      console.log("🔍 RETRIEVING MEMORIES");
      console.log("=".repeat(80));
      console.log(`Agent ID: ${args.agentId}`);
      console.log(`Prompt: ${args.prompt}`);
      console.log(`Symptoms: [${(args.symptoms || []).join(', ')}]`);
      console.log(`Tags: [${(args.tags || []).join(', ')}]`);
      console.log("");

      const bundle = await mem.retrieveContextBundle({
        agentId: args.agentId,
        prompt: args.prompt,
        symptoms: args.symptoms,
        tags: args.tags,
        env: args.env as any,
        caseLimit: args.caseLimit,
        fixLimit: args.fixLimit,
        dontLimit: args.dontLimit,
      });

      console.log("✅ RETRIEVED:");
      console.log(`   Session ID: ${bundle.sessionId}`);
      console.log(`   Fix memories: ${bundle.sections.fix.length}`);
      bundle.sections.fix.forEach((m, idx) => {
        console.log(`     ${idx + 1}. [${m.id}] ${m.title} (confidence: ${m.confidence}, utility: ${m.utility})`);
      });
      console.log(`   Do-not-do memories: ${bundle.sections.doNotDo.length}`);
      bundle.sections.doNotDo.forEach((m, idx) => {
        console.log(`     ${idx + 1}. [${m.id}] ${m.title} (confidence: ${m.confidence}, utility: ${m.utility})`);
      });
      console.log("=".repeat(80) + "\n");

      return bundle;
    },
  });

  const memory_feedback = tool({
    description: "Report which retrieved memories were useful or not useful. This reinforces/degrades association weights.",
    inputSchema: z.object({
      agentId: z.string(),
      sessionId: z.string(),
      usedIds: z.array(z.string()).default([]),
      usefulIds: z.array(z.string()).default([]),
      notUsefulIds: z.array(z.string()).default([]),
      preventedErrorIds: z.array(z.string()).optional(),
      metrics: z.object({
        durationMs: z.number().int().optional(),
        quality: z.number().min(0).max(1).optional(),
        hallucinationRisk: z.number().min(0).max(1).optional(),
        toolCalls: z.number().int().optional(),
        verificationPassed: z.boolean().optional(),
      }).optional(),
    }),
    execute: async (args) => {
      console.log("\n" + "=".repeat(80));
      console.log("📊 MEMORY FEEDBACK");
      console.log("=".repeat(80));
      console.log(`Agent ID: ${args.agentId}`);
      console.log(`Session ID: ${args.sessionId}`);
      console.log(`Used IDs: [${args.usedIds.join(', ')}]`);
      console.log(`Useful IDs: [${args.usefulIds.join(', ')}]`);
      console.log(`Not Useful IDs: [${args.notUsefulIds.join(', ')}]`);
      if (args.preventedErrorIds?.length) {
        console.log(`Prevented Error IDs: [${args.preventedErrorIds.join(', ')}]`);
      }
      if (args.metrics) {
        console.log(`Metrics:`);
        if (args.metrics.quality !== undefined) console.log(`  - Quality: ${args.metrics.quality}`);
        if (args.metrics.hallucinationRisk !== undefined) console.log(`  - Hallucination Risk: ${args.metrics.hallucinationRisk}`);
        if (args.metrics.durationMs !== undefined) console.log(`  - Duration: ${args.metrics.durationMs}ms`);
        if (args.metrics.verificationPassed !== undefined) console.log(`  - Verification Passed: ${args.metrics.verificationPassed}`);
      }

      await mem.feedback(args as any);

      console.log("✅ Feedback recorded successfully");
      console.log("=".repeat(80) + "\n");

      return { ok: true };
    },
  });

  const memory_extract_and_save = tool({
    description:
      "Save distilled learnings discovered while solving the task. Store invariants + verification + fix steps. Can store negative memories for unsafe actions.",
    inputSchema: z.object({
      agentId: z.string(),
      sessionId: z.string().optional(),
      learnings: z.array(z.object({
        kind: z.enum(["semantic", "procedural", "episodic"]),
        polarity: z.enum(["positive","negative"]).optional(),
        title: z.string().min(4),
        content: z.string().min(20),
        tags: z.array(z.string()).min(1),
        confidence: z.number().min(0).max(1),
        env: z.record(z.string(), z.any()).optional(),
        triage: z.object({
          symptoms: z.array(z.string()).min(1),
          likelyCauses: z.array(z.string()).min(1),
          verificationSteps: z.array(z.string()).optional(),
          fixSteps: z.array(z.string()).optional(),
          gotchas: z.array(z.string()).optional(),
        }).optional(),
        antiPattern: z.object({
          action: z.string(),
          whyBad: z.string(),
          saferAlternative: z.string().optional(),
        }).optional()
      })).max(10),
    }),
    execute: async (args) => {
      console.log("\n" + "=".repeat(80));
      console.log("💾 SAVING MEMORIES");
      console.log("=".repeat(80));
      console.log(`Agent ID: ${args.agentId}`);
      console.log(`Session ID: ${args.sessionId || 'N/A'}`);
      console.log(`Number of learnings: ${args.learnings.length}`);
      console.log("");

      args.learnings.forEach((learning, idx) => {
        console.log(`\n📝 Learning ${idx + 1}/${args.learnings.length}:`);
        console.log(`   Kind: ${learning.kind}`);
        console.log(`   Polarity: ${learning.polarity || 'positive'}`);
        console.log(`   Title: ${learning.title}`);
        console.log(`   Confidence: ${learning.confidence}`);
        console.log(`   Tags: [${learning.tags.join(', ')}]`);
        console.log(`   Content: ${learning.content.substring(0, 100)}${learning.content.length > 100 ? '...' : ''}`);

        if (learning.triage) {
          console.log(`   Triage:`);
          console.log(`     - Symptoms: [${learning.triage.symptoms.join(', ')}]`);
          console.log(`     - Likely Causes: [${learning.triage.likelyCauses.join(', ')}]`);
          if (learning.triage.verificationSteps?.length) {
            console.log(`     - Verification Steps: ${learning.triage.verificationSteps.length} steps`);
          }
          if (learning.triage.fixSteps?.length) {
            console.log(`     - Fix Steps: ${learning.triage.fixSteps.length} steps`);
          }
          if (learning.triage.gotchas?.length) {
            console.log(`     - Gotchas: [${learning.triage.gotchas.join(', ')}]`);
          }
        }

        if (learning.antiPattern) {
          console.log(`   Anti-Pattern:`);
          console.log(`     - Action: ${learning.antiPattern.action}`);
          console.log(`     - Why Bad: ${learning.antiPattern.whyBad}`);
          if (learning.antiPattern.saferAlternative) {
            console.log(`     - Safer Alternative: ${learning.antiPattern.saferAlternative}`);
          }
        }
      });

      const result = await mem.saveLearnings(args as any);

      console.log("\n" + "-".repeat(80));
      console.log("✅ SAVE RESULT:");
      console.log(`   Saved: ${result.saved.length} memories`);
      result.saved.forEach((s) => {
        console.log(`     - [${s.kind}] ${s.title} (ID: ${s.id}${s.deduped ? ', DEDUPED' : ''})`);
      });

      if (result.rejected.length > 0) {
        console.log(`   Rejected: ${result.rejected.length} memories`);
        result.rejected.forEach((r) => {
          console.log(`     - ${r.title}: ${r.reason}`);
        });
      }
      console.log("=".repeat(80) + "\n");

      return result;
    },
  });

  const memoryToolDefs = createMemoryTools(mem);
  const toolRegistry: Record<string, any> = {
    memory_get_context,
    memory_feedback,
    memory_extract_and_save,
  };

  for (const def of Object.values(memoryToolDefs)) {
    toolRegistry[def.name] = tool({
      description: def.description,
      inputSchema: def.inputSchema as any,
      execute: def.execute,
    });
  }

  // Stream back NDJSON so the UI can show "memory progress"
  // Set headers for proper streaming (disable buffering)
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering if behind proxy

  // Send headers immediately to start streaming
  res.flushHeaders();

  // Flush function to force immediate send
  const send = (obj: any) => {
    res.write(JSON.stringify(obj) + "\n");
  };

  const unsubscribe = addMemoryEventListener((event) => send({ type: "memory_event", event }));

  const start = Date.now();
  const providerDecision = resolveAgentProvider(process.env);

  const system = `You are an expert technical assistant with access to a memory system that learns from past experiences.

WORKFLOW:

1. FIRST: Use memory_get_context (or memory_get_context_auggie_sdk if available) to retrieve relevant memories
   - agentId: "${body.agentId}"
   - prompt: "${body.prompt}"
   - symptoms: ${JSON.stringify(body.symptoms ?? [])}
   - tags: ${JSON.stringify(body.tags ?? [])}
   - env: ${JSON.stringify(body.env ?? {})}

   The response contains a sessionId and two sections:
   - fix: Solutions that worked before
   - doNotDo: Anti-patterns to avoid

   Save the sessionId for later.

2. Apply the retrieved knowledge to solve the task
   - Cite memories as [MEM:id] when using them
   - If new symptoms appear, call memory_get_context again

3. LAST: Provide feedback and save learnings

   a) Call memory_feedback (or memory_feedback_auggie_sdk) with the sessionId and memory IDs:
      - usedIds: All memories you referenced
      - usefulIds: Memories that helped
      - notUsefulIds: Memories that didn't help
      - preventedErrorIds: Negative memories that prevented mistakes

   b) Call memory_extract_and_save (or memory_extract_and_save_auggie_sdk) with distilled learnings:
      - procedural: Include triage (symptoms, likelyCauses, verificationSteps, fixSteps, gotchas)
      - semantic: Invariants and rules
      - negative: Anti-patterns with polarity="negative" and antiPattern object

Optional tools (use only if needed):
- recall_skills / recall_concepts / recall_patterns to list stored items
- store_skill / store_concept / store_pattern to store a single item
- relate_concepts to link two concepts

Task: ${body.prompt}`;

  // console.log("[SYSTEM_PROMPT]", system);
  console.log(`[AGENT_PROVIDER] ${providerDecision.provider} (${providerDecision.reason})`);
  console.log("[TOOLS_REGISTERED]", Object.keys(toolRegistry));

  try {
    if (providerDecision.provider === "openai") {
      if (!process.env.OPENAI_API_KEY) {
        send({
          type: "error",
          message: "OPENAI_API_KEY is missing. Set it or set AUGGIE_ENABLE=1 to use Auggie.",
        });
        return;
      }

      const openaiModel = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const agent = new ToolLoopAgent({
        model: openai(openaiModel),
        tools: toolRegistry,
      });

      console.log("[PROMPT_START]", new Date().toISOString());
      const stream = await agent.stream({ prompt: system });
      const toolCallsSeen = new Set<string>();
      const answerParts: string[] = [];

      for await (const part of stream.fullStream) {
        if (part.type === "text-delta") {
          answerParts.push(part.text);
          continue;
        }
        if (part.type === "tool-input-start" || part.type === "tool-call") {
          const toolName = (part as any).toolName ?? (part as any).name ?? (part as any).title ?? "tool";
          const id = (part as any).toolCallId ?? (part as any).id ?? toolName;
          if (!toolCallsSeen.has(id)) {
            toolCallsSeen.add(id);
            send({ type: "tool_call", title: toolName });
          }
          continue;
        }
        if (part.type === "tool-result") {
          const toolName = (part as any).toolName ?? (part as any).name ?? (part as any).title ?? "tool";
          send({ type: "tool_call_update", title: toolName });
          continue;
        }
        if (part.type === "tool-error") {
          const toolName = (part as any).toolName ?? (part as any).name ?? (part as any).title ?? "tool";
          send({ type: "tool_call_update", title: `${toolName} (error)` });
          continue;
        }
        if (part.type === "error") {
          const message = part.error instanceof Error ? part.error.message : String(part.error);
          send({ type: "error", message });
        }
      }

      const answer = answerParts.join("");
      console.log("[PROMPT_COMPLETE]", new Date().toISOString());
      console.log("[ANSWER]", answer);

      const durationMs = Date.now() - start;
      send({ type: "final", durationMs, answer });
      console.log("[FINAL_EVENT_SENT]", new Date().toISOString());

      await Promise.allSettled([
        mem.captureEpisode({
          agentId: body.agentId,
          runId,
          workflowName: "agent-run",
          prompt: body.prompt,
          response: answer,
          outcome: "success",
          tags: body.tags,
        }),
        mem.captureStepEpisode({
          agentId: body.agentId,
          runId,
          workflowName: "agent-run",
          stepName: "completion",
          prompt: body.prompt,
          response: answer,
          outcome: "success",
          tags: body.tags,
        }),
      ]);
      return;
    }

    const auggieModel = process.env.AUGGIE_MODEL ?? DEFAULT_AUGGIE_MODEL;

    // Support multiple authentication methods:
    // 1. Direct API key via AUGMENT_API_TOKEN env var (recommended)
    // 2. Environment variables (AUGMENT_API_TOKEN + AUGMENT_API_URL)
    // 3. settings.json file (automatically loaded by SDK)
    const authConfig: any = { model: auggieModel };

    // If AUGMENT_API_TOKEN is provided, use it directly
    if (process.env.AUGMENT_API_TOKEN) {
      authConfig.apiKey = process.env.AUGMENT_API_TOKEN;
      // Optionally include apiUrl if provided
      if (process.env.AUGMENT_API_URL) {
        authConfig.apiUrl = process.env.AUGMENT_API_URL;
      }
    }
    // Otherwise, SDK will automatically try to load from settings.json

    auggieClient = await Auggie.create({
      ...authConfig,
      tools: toolRegistry,
      // Disable web-search to force the agent to use memory tools instead of searching for documentation
      excludedTools: ["web-search"],
    });

    auggieClient.onSessionUpdate((event: any) => {
      // Debug logging to see all events
      const timestamp = new Date().toISOString();
      // console.log(`[${timestamp}] [SESSION_UPDATE]`, JSON.stringify(event, null, 2));

      const up = event?.update;
      if (!up) {
        console.log(`[${timestamp}] [WARNING] No update in event`);
        return;
      }

      // console.log(`[${timestamp}] [UPDATE_TYPE] ${up.sessionUpdate}`);

      if (up.sessionUpdate === "tool_call") {
        // console.log(`[${timestamp}] [TOOL_CALL] ${up.title}`);
        // console.log(`[${timestamp}] [TOOL_CALL_RAW_INPUT]`, JSON.stringify(up.rawInput));

        const isMemoryTool = up.title && (
          up.title.includes("memory_get_context") ||
          up.title.includes("memory_feedback") ||
          up.title.includes("memory_extract_and_save")
        );

        if (isMemoryTool) {
          console.log(`[${timestamp}] [✅ CUSTOM_MEMORY_TOOL_CALLED] ${up.title}`);
        }

        send({ type: "tool_call", title: up.title });
        // console.log(`[${timestamp}] [SENT] tool_call event to client`);
      } else if (up.sessionUpdate === "tool_call_update") {
        // console.log(`[${timestamp}] [TOOL_CALL_UPDATE] ${up.title}`);
        // console.log(`[${timestamp}] [TOOL_CALL_UPDATE_RAW_OUTPUT]`, JSON.stringify(up.rawOutput));

        send({ type: "tool_call_update", title: up.title });
        // console.log(`[${timestamp}] [SENT] tool_call_update event to client`);
      } else if (up.sessionUpdate === "agent_message_chunk") {
        // console.log(`[${timestamp}] [AGENT_MESSAGE_CHUNK]`, up.content);
      }
    });

    console.log("[PROMPT_START]", new Date().toISOString());
    // Explicitly set isAnswerOnly to false to allow tool calls
    const answer = await auggieClient.prompt(system, { isAnswerOnly: false });
    console.log("[PROMPT_COMPLETE]", new Date().toISOString());
    console.log("[ANSWER]", answer);

    const durationMs = Date.now() - start;
    send({ type: "final", durationMs, answer });
    console.log("[FINAL_EVENT_SENT]", new Date().toISOString());

    await Promise.allSettled([
      mem.captureEpisode({
        agentId: body.agentId,
        runId,
        workflowName: "agent-run",
        prompt: body.prompt,
        response: answer,
        outcome: "success",
        tags: body.tags,
      }),
      mem.captureStepEpisode({
        agentId: body.agentId,
        runId,
        workflowName: "agent-run",
        stepName: "completion",
        prompt: body.prompt,
        response: answer,
        outcome: "success",
        tags: body.tags,
      }),
    ]);
  } catch (e: any) {
    console.log("[ERROR]", e);
    send({ type: "error", message: e?.message ?? String(e) });

    await Promise.allSettled([
      mem.captureEpisode({
        agentId: body.agentId,
        runId,
        workflowName: "agent-run",
        prompt: body.prompt,
        response: e?.message ?? String(e),
        outcome: "failure",
        tags: body.tags,
      }),
      mem.captureStepEpisode({
        agentId: body.agentId,
        runId,
        workflowName: "agent-run",
        stepName: "completion",
        prompt: body.prompt,
        response: e?.message ?? String(e),
        outcome: "failure",
        tags: body.tags,
      }),
    ]);
  } finally {
    console.log("[CLEANUP_START]", new Date().toISOString());
    if (auggieClient) {
      await auggieClient.close();
    }
    unsubscribe();
    res.end();
    console.log("[CLEANUP_COMPLETE]", new Date().toISOString());
  }
};

// Register the handler for both routes
app.post("/agent/run", agentRunHandler);
app.post("/think", agentRunHandler);

app.listen(PORT, () => {
  console.log(`demo-api listening on http://localhost:${PORT}`);
});
