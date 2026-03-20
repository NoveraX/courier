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
