// ── Safe event field helpers ────────────────────────────────────────────────

export function str(val: unknown, fallback = ""): string {
  return typeof val === "string" ? val : fallback
}

export function num(val: unknown, fallback = 0): number {
  return typeof val === "number" && Number.isFinite(val) ? val : fallback
}

export function optStr(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined
}

export function optNum(val: unknown): number | undefined {
  return typeof val === "number" && Number.isFinite(val) ? val : undefined
}

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null
}
