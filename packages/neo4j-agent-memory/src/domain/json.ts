export function parseJsonField<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export function toDateString(value: any): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value?.toString === "function") return value.toString();
  return String(value);
}

