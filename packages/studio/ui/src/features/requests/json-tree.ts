/** A line of a JSON tree: an object or array opening, its closing, or a value. */
export interface JsonTreeRow {
  /** The value's path, keys and indices joined by dots, as validation issues name it; `""` for the root. */
  path: string;
  depth: number;
  /** The key the value sits under: a name, an index, or none for the root and a closing. */
  key: { text: string; index: boolean } | null;
  kind: "open" | "close" | "value";
  /** For an opening: whether its contents are hidden, and how many there are. */
  collapsed?: boolean;
  summary?: string;
  /** For a value, and an opening's bracket: the text shown. */
  text: string;
  tone: "string" | "number" | "literal" | "punctuation";
  /** The validation issue at the value, when there is one. */
  issue?: string | undefined;
}

type Json = unknown;

function isContainer(value: Json): value is Record<string, Json> | Json[] {
  return typeof value === "object" && value !== null;
}

function entriesOf(value: Record<string, Json> | Json[]): [string, Json, boolean][] {
  return Array.isArray(value)
    ? value.map((item, i) => [String(i), item, true])
    : Object.entries(value).map(([k, v]) => [k, v, false]);
}

function leaf(value: Json): Pick<JsonTreeRow, "text" | "tone"> {
  if (typeof value === "string") return { text: JSON.stringify(value), tone: "string" };
  if (typeof value === "number") return { text: String(value), tone: "number" };
  return { text: String(value), tone: "literal" };
}

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

/**
 * A JSON value as the lines of a tree, with the containers whose paths are
 * collapsed shown closed, and the issues at their values.
 *
 * @param value - The value
 * @param collapsed - The paths of the containers shown closed
 * @param issues - Validation issues by path
 * @returns The rows
 * @example
 * ```ts
 * jsonTreeRows({ a: [1] }, new Set(), new Map()).map((r) => r.text); // ["{", "[", "1", "]", "}"]
 * ```
 */
export function jsonTreeRows(
  value: Json,
  collapsed: ReadonlySet<string>,
  issues: ReadonlyMap<string, string>,
): JsonTreeRow[] {
  const rows: JsonTreeRow[] = [];
  const walk = (v: Json, key: JsonTreeRow["key"], path: string, depth: number) => {
    if (!isContainer(v)) {
      rows.push({ path, depth, key, kind: "value", ...leaf(v), issue: issues.get(path) });
      return;
    }
    const entries = entriesOf(v);
    const closed = collapsed.has(path);
    const array = Array.isArray(v);
    const summary = `${entries.length} ${array ? "items" : "keys"}`;
    const text = closed ? (array ? "[…]" : "{…}") : array ? "[" : "{";
    rows.push({
      path,
      depth,
      key,
      kind: "open",
      collapsed: closed,
      summary,
      text,
      tone: "punctuation",
    });
    if (closed) return;
    for (const [k, item, index] of entries)
      walk(item, { text: k, index }, join(path, k), depth + 1);
    rows.push({
      path,
      depth,
      key: null,
      kind: "close",
      text: array ? "]" : "}",
      tone: "punctuation",
    });
  };
  walk(value, null, "", 0);
  return rows;
}

/**
 * The paths of every object and array in a JSON value, to close them all.
 *
 * @param value - The value
 * @returns The paths, the root's `""` among them
 * @example
 * ```ts
 * containerPaths({ a: { b: 1 } }); // ["", "a"]
 * ```
 */
export function containerPaths(value: Json): string[] {
  const paths: string[] = [];
  const walk = (v: Json, path: string) => {
    if (!isContainer(v)) return;
    paths.push(path);
    for (const [k, item] of entriesOf(v)) walk(item, join(path, k));
  };
  walk(value, "");
  return paths;
}

/**
 * The value at a dotted path, as validation issues name one.
 *
 * @param value - The value
 * @param path - The path: `hits.1.price`
 * @returns What is there, and whether anything is
 * @example
 * ```ts
 * valueAtPath({ hits: [{}, { price: "64.00" }] }, "hits.1.price"); // { found: true, value: "64.00" }
 * ```
 */
export function valueAtPath(value: Json, path: string): { found: boolean; value: Json } {
  let current: Json = value;
  for (const key of path ? path.split(".") : []) {
    if (!isContainer(current)) return { found: false, value: undefined };
    const next = Array.isArray(current) ? current[Number(key)] : current[key];
    if (next === undefined && !(key in current)) return { found: false, value: undefined };
    current = next;
  }
  return { found: true, value: current };
}
