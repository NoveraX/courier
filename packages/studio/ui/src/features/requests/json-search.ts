/** What a search over a JSON value found, and what a tree keeps to show it. */
export interface JsonSearch {
  /** The paths of the keys and values that match, in the order a tree shows them; the first `limit` of them. */
  readonly matches: readonly string[];
  /** How many keys and values match in all: as many as `matches` names, or more where it stops at its limit. */
  readonly count: number;
  /** The containers to open so every match shows: those on the way to one, and those whose key matches. */
  readonly opened: ReadonlySet<string>;
  /** Whether a tree keeps the row of a path: a match, what holds one, or what a matched container holds. */
  readonly keeps: (path: string) => boolean;
}

type Json = unknown;

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

/* Every path that holds this one, the root's `""` among them. */
function holdersOf(path: string): string[] {
  const parts = path.split(".");
  return parts.map((_, at) => parts.slice(0, at).join("."));
}

/* A leaf as a search reads it: a string as it is, anything else as JSON writes it. */
function textOf(value: Json): string {
  return typeof value === "string" ? value : String(value);
}

/**
 * Search a JSON value for a text, as a person searching a response means
 * it: in every key and every value, whatever their case. A container whose
 * key matches is shown whole. Every match is counted; past `limit`, the
 * rest are counted and not named, so a search over a large body names no
 * more than a view can show.
 *
 * @param value - The value, as parsed from JSON
 * @param query - The text sought; blank seeks nothing
 * @param limit - The most matches named
 * @returns What it found, or `undefined` for a blank query
 * @example
 * ```ts
 * searchJson({ city: { name: "Kazan" } }, "kaz")?.matches; // ["city.name"]
 * searchJson(cities, "a", 100)?.count; // 4 105, of which `matches` names 100
 * ```
 */
export function searchJson(
  value: Json,
  query: string,
  limit: number = Number.POSITIVE_INFINITY,
): JsonSearch | undefined {
  const sought = query.trim().toLowerCase();
  if (sought === "") return undefined;
  const matches: string[] = [];
  const whole = new Set<string>();
  let count = 0;
  const found = (path: string, container: boolean): void => {
    count += 1;
    if (matches.length >= limit) return;
    matches.push(path);
    if (container) whole.add(path);
  };
  const walk = (v: Json, path: string, keyMatches: boolean): void => {
    if (typeof v !== "object" || v === null) {
      if (keyMatches || textOf(v).toLowerCase().includes(sought)) found(path, false);
      return;
    }
    if (keyMatches) found(path, true);
    const items: readonly unknown[] = Array.isArray(v) ? v : [];
    const named: [string, unknown][] = Array.isArray(v) ? [] : Object.entries(v);
    const entries = Array.isArray(v)
      ? items.map((item, at) => [String(at), item, true] as const)
      : named.map(([k, item]) => [k, item, false] as const);
    for (const [key, item, index] of entries) {
      walk(item, join(path, key), !index && key.toLowerCase().includes(sought));
    }
  };
  walk(value, "", false);
  const matched = new Set(matches);
  const holders = new Set(matches.flatMap((path) => (path === "" ? [] : holdersOf(path))));
  const opened = new Set([...holders, ...whole]);
  const keeps = (path: string): boolean =>
    matched.has(path) ||
    holders.has(path) ||
    (whole.size > 0 && [...holdersOf(path), path].some((holder) => whole.has(holder)));
  return { matches, count, opened, keeps };
}
