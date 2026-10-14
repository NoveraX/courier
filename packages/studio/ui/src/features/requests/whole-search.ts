import { searchJson } from "./json-search";
import { type JsonTreeRow, jsonTreeRows } from "./json-tree";

/**
 * The most a search over a whole body shows: the matches it names, the
 * tree's rows, the raw text's lines. A match takes three rows or so — its
 * value and the object holding it — so the rows hold a thousand.
 */
export const WHOLE_LIMITS = { matches: 1_000, rows: 4_000, lines: 1_000 } as const;

/** A line of a whole body's JSON text that holds the text sought. */
export interface FoundLine {
  /** Its number in the whole body's text, from 1. */
  number: number;
  text: string;
}

/** What a search over a whole body found, as much of it as a view shows. */
export interface WholeSearchResult {
  /** How many matches there are in all: keys and values for the tree, lines for the raw text. */
  count: number;
  /** For the tree: the paths of the matches its rows show, in their order. */
  matches: readonly string[];
  /** For the tree: each match shown, and what holds it. */
  rows: readonly JsonTreeRow[];
  /** For the raw text: the lines that hold the text, as many as show. */
  lines: readonly FoundLine[];
  /** Whether more was found than shows: matches past those named, or rows past the most a view holds. */
  cut: boolean;
}

const NO_ISSUES: ReadonlyMap<string, string> = new Map();
const NONE_CLOSED: ReadonlySet<string> = new Set();

/**
 * Search a whole body's keys and values, as the tree reads them: every
 * match counted, the first ones named, and the rows that show them — each
 * match and what holds it — built by walking only into what holds one.
 *
 * @param value - The whole body, as parsed from JSON
 * @param query - The text sought; blank seeks nothing
 * @returns What it found, or `undefined` for a blank query
 * @example
 * ```ts
 * searchWholeTree({ cities: [{ name: "Kazan" }] }, "kaz")?.matches; // ["cities.0.name"]
 * ```
 */
export function searchWholeTree(value: unknown, query: string): WholeSearchResult | undefined {
  const found = searchJson(value, query, WHOLE_LIMITS.matches);
  if (!found) return undefined;
  const walked = jsonTreeRows(value, NONE_CLOSED, NO_ISSUES, {
    keeps: found.keeps,
    limit: WHOLE_LIMITS.rows,
  });
  const rows = walked.slice(0, WHOLE_LIMITS.rows);
  const shown = new Set(rows.map((row) => row.path));
  const matches = found.matches.filter((path) => shown.has(path));
  /* A container whose key matches shows whole, and a large one runs past the rows a view holds. */
  const cut = found.count > matches.length || walked.length > rows.length;
  return { count: found.count, matches, rows, lines: [], cut };
}

/**
 * Search a whole body's JSON text line by line, as the raw view reads it:
 * every line that holds the text counted, the first ones kept with their
 * numbers in the whole text.
 *
 * @param text - The whole body's lines, as `JSON.stringify(value, null, 2)` prints them
 * @param query - The text sought; blank seeks nothing
 * @returns What it found, or `undefined` for a blank query
 * @example
 * ```ts
 * searchWholeLines(['{', '  "city": "Kazan"', '}'], "kaz")?.lines; // [{ number: 2, text: '  "city": "Kazan"' }]
 * ```
 */
export function searchWholeLines(
  text: readonly string[],
  query: string,
): WholeSearchResult | undefined {
  const sought = query.trim().toLowerCase();
  if (sought === "") return undefined;
  const lines: FoundLine[] = [];
  let count = 0;
  text.forEach((line, at) => {
    if (!line.toLowerCase().includes(sought)) return;
    count += 1;
    if (lines.length < WHOLE_LIMITS.lines) lines.push({ number: at + 1, text: line });
  });
  return { count, matches: [], rows: [], lines, cut: count > lines.length };
}
