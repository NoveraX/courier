export type SortDir = "asc" | "desc";
export type FieldType = "str" | "num" | "bool" | "obj" | "arr" | "null";

/** Scan records for column keys (up to 50 for performance) */
export function detectColumns(records: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const record of records.slice(0, 50)) {
    for (const k of Object.keys(record)) keys.add(k);
  }
  return Array.from(keys);
}

/** Detect dominant type per column from first N records */
export function detectColumnTypes(
  records: Record<string, unknown>[],
  columns: string[],
): Record<string, FieldType> {
  const types: Record<string, FieldType> = {};
  const sample = records[0];
  if (sample === undefined) return types;
  for (const col of columns) {
    types[col] = detectType(sample[col]);
  }
  return types;
}

export function detectType(value: unknown): FieldType {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return "num";
  if (Array.isArray(value)) return "arr";
  if (typeof value === "object") return "obj";
  return "str";
}

export function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export function parseValue(raw: string, type: FieldType): unknown {
  if (type === "num") {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (type === "bool") return raw === "true";
  if (type === "null") return null;
  if (type === "obj" || type === "arr") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export function recordKey(record: Record<string, unknown>, idx: number): string {
  const id = record.id ?? record._id;
  return id !== undefined ? String(id) : `row-${idx}`;
}

export function sortRecords(
  records: Record<string, unknown>[],
  col: string,
  dir: SortDir,
): Record<string, unknown>[] {
  const sorted = [...records].sort((a, b) => {
    const aVal = a[col];
    const bVal = b[col];
    if (aVal === bVal) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "number" && typeof bVal === "number") return aVal - bVal;
    return String(aVal).localeCompare(String(bVal));
  });
  return dir === "desc" ? sorted.reverse() : sorted;
}
