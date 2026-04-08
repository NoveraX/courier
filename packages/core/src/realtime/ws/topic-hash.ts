/**
 * Deterministic hash for WS topic qualification.
 * Produces a short hex suffix from variables for topic uniqueness.
 */

/** Sort keys recursively for deterministic serialization */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const sorted = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    sorted.map((k) => k + ":" + stableStringify((value as Record<string, unknown>)[k])).join(",") +
    "}"
  );
}

/** FNV-1a 32-bit hash -> 8-char hex string */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Compute deterministic hash from variables */
export function hashVariables(variables: unknown): string {
  const serialized = stableStringify(variables);
  return fnv1a(serialized);
}

/**
 * Qualify a base topic with a variables hash suffix.
 * Returns `baseTopic` if no variables, or `baseTopic#hash` if variables present.
 */
export function qualifyTopic(baseTopic: string, variables?: unknown): string {
  if (variables === undefined || variables === null) return baseTopic;
  if (
    typeof variables === "object" &&
    Object.keys(variables as Record<string, unknown>).length === 0
  ) {
    return baseTopic;
  }
  return `${baseTopic}#${hashVariables(variables)}`;
}

/** Extract base topic and optional hash from a qualified topic */
export function unqualifyTopic(qualifiedTopic: string): { baseTopic: string; hash?: string } {
  const idx = qualifiedTopic.indexOf("#");
  if (idx === -1) return { baseTopic: qualifiedTopic };
  return { baseTopic: qualifiedTopic.slice(0, idx), hash: qualifiedTopic.slice(idx + 1) };
}
