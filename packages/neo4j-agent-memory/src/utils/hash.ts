import { createHash, randomUUID } from "node:crypto";
import type { EnvironmentFingerprint } from "../types.js";

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function canonicaliseForHash(title: string, content: string, tags: string[]): string {
  const tagNorm = [...new Set(tags.map(norm))].sort().join(",");
  return `${norm(title)}\n${norm(content)}\n${tagNorm}`;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function normaliseSymptom(s: string): string {
  return norm(s);
}

export function envHash(env: EnvironmentFingerprint): string {
  // Hash only "high signal" keys in a stable order to create a compact key.
  const payload = {
    os: env.os ?? null,
    distro: env.distro ?? null,
    ci: env.ci ?? null,
    container: env.container ?? null,
    filesystem: env.filesystem ?? null,
    workspaceMount: env.workspaceMount ?? null,
    nodeVersion: env.nodeVersion ?? null,
    packageManager: env.packageManager ?? null,
    pmVersion: env.pmVersion ?? null,
  };
  return sha256Hex(JSON.stringify(payload));
}
