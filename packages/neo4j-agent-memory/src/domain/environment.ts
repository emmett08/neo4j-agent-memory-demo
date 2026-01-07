import type { EnvironmentFingerprint } from "../types.js";
import { envHash } from "../utils/hash.js";

export function ensureEnvHash(env?: EnvironmentFingerprint): EnvironmentFingerprint {
  const e = env ?? {};
  if (!e.hash) e.hash = envHash(e);
  return e;
}

