import type { ParsedGroup, GenerateOptions, SourceConfig, SourceState } from "./types"

export const HTTP_METHOD_COLORS: Record<string, string> = {
  get: "text-emerald-400",
  post: "text-amber-400",
  put: "text-sky-400",
  patch: "text-indigo-400",
  delete: "text-red-400",
}

export const DEFAULT_OPTIONS: GenerateOptions = {
  sourceName: "api",
  outputDir: "src/api",
  validation: "zod",
  groupBy: "tag",
  generateTypes: true,
  generateSchemas: true,
  addAuthMiddleware: true,
  includeComments: true,
  generateClient: "direct",
  selectedEndpoints: null,
}

export function createDefaultSource(name = "api"): SourceConfig {
  return {
    name,
    importSource: "url",
    importContent: "",
    options: { ...DEFAULT_OPTIONS, sourceName: name, outputDir: "src/api" },
    selectedEndpoints: {},
  }
}

export function createDefaultState(): SourceState {
  return { spec: null, prevSpec: null, selection: {}, files: [], activeFileIndex: 0 }
}

/** Generate a stable unique key for a group (handles empty/duplicate names). */
export function groupKey(group: ParsedGroup, index: number): string {
  if (group.name) return group.name
  return `__group_${index}_${group.prefix.replace(/[^a-zA-Z0-9]/g, "_")}`
}

/** Derive a camelCase source name from the spec title and/or baseURL. */
export function deriveSourceName(title: string, baseURL?: string): string {
  const cleaned = title
    .replace(/\b(api|service|platform|cloud|public|private|rest|restful|v\d+(\.\d+)*)\b/gi, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
  if (cleaned) {
    const words = cleaned.split(/\s+/).filter(Boolean)
    if (words.length > 0) {
      const parts = words.slice(0, 2)
      const result = parts.map((w, i) => {
        const lower = w.toLowerCase()
        return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
      }).join("")
      if (result) return result
    }
  }
  if (baseURL) {
    try {
      const hostname = new URL(baseURL).hostname
      const parts = hostname.split(".")
      const meaningful = parts.filter((p) => !["api", "www", "com", "org", "net", "io", "dev", "cloud", "app"].includes(p))
      if (meaningful.length > 0 && meaningful[0]) return meaningful[0].toLowerCase()
    } catch { /* not a valid URL */ }
  }
  return "api"
}

/** Format write result into a human-readable message */
export function formatWriteResult(r: { written: number; merged: number; deleted?: number }): string {
  const parts = [`${r.written} file${r.written !== 1 ? "s" : ""} written`]
  if (r.merged > 0) parts.push(`${r.merged} merged`)
  if (r.deleted && r.deleted > 0) parts.push(`${r.deleted} removed`)
  return parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(", ")})` : parts[0]
}
