export function envOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export function envOrDefault(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : defaultValue;
}

export function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function envBool(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const normalised = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalised)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalised)) return false;
  return defaultValue;
}

