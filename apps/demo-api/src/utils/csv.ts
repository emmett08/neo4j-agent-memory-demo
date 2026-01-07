import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

export interface CsvParseOptions {
  delimiter?: string;
  allowComments?: boolean;
}

export function parseCsvText(text: string, opts: CsvParseOptions = {}): Array<Record<string, string>> {
  const delimiter = opts.delimiter ?? ",";
  const allowComments = opts.allowComments ?? true;

  const records = parse(text, {
    columns: true,
    bom: true,
    delimiter,
    comment: allowComments ? "#" : undefined,
    skip_empty_lines: true,
    trim: true,
    relax_column_count_less: true,
  }) as Array<Record<string, unknown>>;

  // Ensure string values (our seed files are stringly-typed)
  return records.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) out[k] = v === undefined || v === null ? "" : String(v);
    return out;
  });
}

export async function parseCsvFile(path: string, opts: CsvParseOptions = {}): Promise<Array<Record<string, string>>> {
  const text = await readFile(path, "utf8");
  return parseCsvText(text, opts);
}

export function parsePipeList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseNumber(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

export function parseBoolean(value: string, fallback: boolean): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return fallback;
  if (["true", "1", "yes", "y", "on"].includes(trimmed)) return true;
  if (["false", "0", "no", "n", "off"].includes(trimmed)) return false;
  return fallback;
}
