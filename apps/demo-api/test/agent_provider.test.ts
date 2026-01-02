import test from "node:test";
import assert from "node:assert/strict";
import { resolveAgentProvider } from "../src/agent_provider.js";

test("prefers openai when OPENAI_API_KEY is set", () => {
  const res = resolveAgentProvider({ OPENAI_API_KEY: "sk-test" } as NodeJS.ProcessEnv);
  assert.equal(res.provider, "openai");
});

test("uses auggie when AUGGIE_ENABLE is true", () => {
  const res = resolveAgentProvider({ AUGGIE_ENABLE: "true" } as NodeJS.ProcessEnv);
  assert.equal(res.provider, "auggie");
});

test("defaults to openai when no provider is configured", () => {
  const res = resolveAgentProvider({} as NodeJS.ProcessEnv);
  assert.equal(res.provider, "openai");
});
