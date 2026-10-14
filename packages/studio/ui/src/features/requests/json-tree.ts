/** A line of a JSON tree: an object or array opening, its closing, or a value. */
export interface JsonTreeRow {
  /** The value's path, keys and indices joined by dots, as validation issues name it; `""` for the root. */
  path: string;
  /** How code reaches the value from the root: `data.cities[3].name`; `""` for the root. */
  accessor: string;
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

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/* How code reaches a child: an index in brackets, a name after a dot, any other key quoted in brackets. */
function childAccessor(parent: string, key: string, index: boolean): string {
  if (index) return `${parent}[${key}]`;
  if (IDENTIFIER.test(key)) return parent ? `${parent}.${key}` : key;
  return `${parent}[${JSON.stringify(key)}]`;
}

/** Which rows a tree keeps, and the most it keeps. */
export interface KeptRows {
  /** Whether the row of a path is kept; a container that is not is passed by whole. */
  keeps: (path: string) => boolean;
  /** The most rows: past it, the walk stops, one row over, so a caller can tell. */
  limit: number;
}

/**
 * A JSON value as the lines of a tree, with the containers whose paths are
 * collapsed shown closed, and the issues at their values. Given what to
 * keep, it walks only into what it keeps, so a search over a large value
 * costs what it shows rather than the whole value, and stops one row past
 * the limit.
 *
 * @param value - The value
 * @param collapsed - The paths of the containers shown closed
 * @param issues - Validation issues by path
 * @param kept - The rows kept, and the most of them
 * @returns The rows
 * @example
 * ```ts
 * jsonTreeRows({ a: [1] }, new Set(), new Map()).map((r) => r.text); // ["{", "[", "1", "]", "}"]
 * jsonTreeRows(body, new Set(), new Map(), { keeps: found.keeps, limit: 3_000 });
 * ```
 */
export function jsonTreeRows(
  value: Json,
  collapsed: ReadonlySet<string>,
  issues: ReadonlyMap<string, string>,
  kept?: KeptRows,
): JsonTreeRow[] {
  const rows: JsonTreeRow[] = [];
  const full = (): boolean => kept !== undefined && rows.length > kept.limit;
  const walk = (
    v: Json,
    key: JsonTreeRow["key"],
    at: { path: string; accessor: string },
    depth: number,
  ) => {
    if (full()) return;
    const { path, accessor } = at;
    if (!isContainer(v)) {
      rows.push({ path, accessor, depth, key, kind: "value", ...leaf(v), issue: issues.get(path) });
      return;
    }
    const entries = entriesOf(v);
    const closed = collapsed.has(path);
    const array = Array.isArray(v);
    const summary = `${entries.length} ${array ? "items" : "keys"}`;
    const text = closed ? (array ? "[…]" : "{…}") : array ? "[" : "{";
    rows.push({
      path,
      accessor,
      depth,
      key,
      kind: "open",
      collapsed: closed,
      summary,
      text,
      tone: "punctuation",
    });
    if (closed) return;
    for (const [k, item, index] of entries) {
      const child = { path: join(path, k), accessor: childAccessor(accessor, k, index) };
      if (kept && !kept.keeps(child.path)) continue;
      walk(item, { text: k, index }, child, depth + 1);
      if (full()) return;
    }
    rows.push({
      path,
      accessor,
      depth,
      key: null,
      kind: "close",
      text: array ? "]" : "}",
      tone: "punctuation",
    });
  };
  if (!kept || kept.keeps("")) walk(value, null, { path: "", accessor: "" }, 0);
  return rows;
}

/** A line of a JSON value printed two spaces deep, and the issue at its value. */
export interface JsonLine {
  text: string;
  issue?: string | undefined;
}

/**
 * A JSON value printed as `JSON.stringify(value, null, 2)` prints it, line
 * by line, each line knowing the issue at its value — so a raw view can mark
 * the line a validation issue points at.
 *
 * @param value - The value, as parsed from JSON
 * @param issues - Validation issues by path
 * @returns The lines
 * @example
 * ```ts
 * jsonLines({ a: 1 }, new Map([["a", "Expected string"]])); // [{ text: "{" }, { text: '  "a": 1', issue: "Expected string" }, { text: "}" }]
 * ```
 */
export function jsonLines(value: Json, issues: ReadonlyMap<string, string>): JsonLine[] {
  const lines: JsonLine[] = [];
  const walk = (v: Json, key: string | null, path: string, depth: number, last: boolean) => {
    const indent = "  ".repeat(depth);
    const prefix = key === null ? "" : `${JSON.stringify(key)}: `;
    const comma = last ? "" : ",";
    if (!isContainer(v)) {
      lines.push({
        text: `${indent}${prefix}${JSON.stringify(v) ?? "null"}${comma}`,
        issue: issues.get(path),
      });
      return;
    }
    const array = Array.isArray(v);
    const entries = entriesOf(v);
    if (entries.length === 0) {
      lines.push({
        text: `${indent}${prefix}${array ? "[]" : "{}"}${comma}`,
        issue: issues.get(path),
      });
      return;
    }
    lines.push({ text: `${indent}${prefix}${array ? "[" : "{"}`, issue: issues.get(path) });
    entries.forEach(([k, item, index], i) => {
      walk(item, index ? null : k, join(path, k), depth + 1, i === entries.length - 1);
    });
    lines.push({ text: `${indent}${array ? "]" : "}"}${comma}` });
  };
  walk(value, null, "", 0, true);
  return lines;
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
