export type AgentProvider = "openai" | "auggie";

export interface ProviderDecision {
  provider: AgentProvider;
  reason: string;
}

export function resolveAgentProvider(env: NodeJS.ProcessEnv): ProviderDecision {
  if (env.OPENAI_API_KEY) {
    return { provider: "openai", reason: "OPENAI_API_KEY set" };
  }

  const auggieEnabled =
    env.AUGGIE_ENABLE?.toLowerCase() === "true" ||
    env.AUGGIE_ENABLE === "1" ||
    Boolean(env.AUGMENT_API_TOKEN);

  if (auggieEnabled) {
    return { provider: "auggie", reason: "AUGGIE_ENABLE or AUGMENT_API_TOKEN set" };
  }

  return { provider: "openai", reason: "default" };
}
