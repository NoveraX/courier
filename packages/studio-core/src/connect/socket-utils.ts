import type { Sources } from "@noverax/nexus/define";

/** Safely extract process.env as a plain Record (Node.js only) */
export function extractProcessEnv(): Record<string, string> {
  try {
    if (typeof process === "undefined" || !process.env) return {};
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

/**
 * Validate a `catalog:names` mapping payload arriving from the studio server.
 * Drops any entry whose key or value is not a string so a malformed mapping
 * (`{ users: 42 }`) can never silently mis-rename sources via implicit
 * coercion inside `renameSourceKeys`. Returns `undefined` when nothing
 * survives so the caller can skip the rename entirely.
 */
export function sanitizeNameMapping(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === "string" && typeof value === "string" && value.length > 0) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Resolve the correct source key from a Sources map */
export function resolveSource(sources: Sources, source: string, group: string): string {
  if (Object.hasOwn(sources, source)) return source;
  const keys = Object.keys(sources);
  const hasGroup = group !== undefined && group !== "";
  const match = hasGroup
    ? keys.find((k) => {
        const s = sources[k];
        return s?.options?.groups && group in s.options.groups;
      })
    : keys[0];
  return match ?? keys[0] ?? source;
}
