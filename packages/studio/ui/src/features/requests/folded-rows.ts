import type { JsonTreeRow } from "./json-tree";

/* Every path that holds this one, the root's `""` among them. */
function holdersOf(path: string): string[] {
  const parts = path.split(".");
  return parts.map((_, at) => parts.slice(0, at).join("."));
}

/**
 * A tree's rows built elsewhere, with the containers closed that are: each
 * one's rows left out up to its closing, and the opening drawn closed. A
 * container that holds a match stays open, so closing what the tree showed
 * before a search hides none of what it found.
 *
 * @param rows - The rows, in order
 * @param matches - The paths of the matches the rows show
 * @param collapsed - The paths of the containers closed
 * @returns The rows shown
 * @example
 * ```ts
 * foldedRows(rows, ["cities.4100.name"], new Set(["meta"])); // `meta` drawn closed, its rows left out
 * ```
 */
export function foldedRows(
  rows: readonly JsonTreeRow[],
  matches: readonly string[],
  collapsed: ReadonlySet<string>,
): JsonTreeRow[] {
  const holders = new Set(matches.flatMap((path) => (path === "" ? [] : holdersOf(path))));
  const shown: JsonTreeRow[] = [];
  let passing: string | undefined;
  for (const row of rows) {
    if (passing !== undefined) {
      if (row.kind === "close" && row.path === passing) passing = undefined;
      continue;
    }
    if (row.kind === "open" && collapsed.has(row.path) && !holders.has(row.path)) {
      shown.push({ ...row, collapsed: true, text: row.text === "[" ? "[…]" : "{…}" });
      passing = row.path;
      continue;
    }
    shown.push(row);
  }
  return shown;
}
