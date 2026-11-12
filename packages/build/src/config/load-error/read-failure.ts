/**
 * What the error a failed load threw says, read as the loader and Node
 * write it: the module whose transform failed, and where; the import that
 * did not resolve, and the module that made it; and what was thrown, as a
 * line to quote.
 */

import { shownText } from "./shown-text";
import { describedValue } from "./without-secrets";

/* The line and column of a place, between its brackets. */
const PLACE = /^\d+:\d+$/;
/* What Node writes between the import and the module that made it. */
const IMPORTED_FROM = " imported from ";
/* What ends a line where `.` stops: a carriage return and Unicode's two line ends. */
const LINE_ENDS = ["\r", "\u2028", "\u2029"];

/** What the transformer said of a module that failed. */
export interface FailedTransform {
  readonly file: string;
  readonly line: number | undefined;
  readonly column: number | undefined;
  readonly said: string;
}

/**
 * The module whose transform failed, where the error is the one the loader
 * threw for it.
 *
 * @param error - What the load threw
 * @param failures - Each module whose transform failed in the load, with what the transformer said
 * @returns The module, where it stopped and what the transformer said; `undefined` for another failure
 * @example
 * ```ts
 * failedTransform(error, new Map([["/app/src/api.ts", babelError]]))?.line; // 3
 * ```
 */
export function failedTransform(
  error: unknown,
  failures: ReadonlyMap<string, unknown> | undefined,
): FailedTransform | undefined {
  const message = error instanceof Error ? error.message : "";
  for (const [file, said] of failures ?? []) {
    if (message.includes(file)) return { file, ...parseError(said, file) };
  }
  return undefined;
}

/* The transformer's error: where it stopped, and its message without the file and the place it names. */
function parseError(
  said: unknown,
  file: string,
): { line: number | undefined; column: number | undefined; said: string } {
  const loc: unknown = said instanceof Error ? Reflect.get(said, "loc") : undefined;
  const line: unknown =
    typeof loc === "object" && loc !== null ? Reflect.get(loc, "line") : undefined;
  const column: unknown =
    typeof loc === "object" && loc !== null ? Reflect.get(loc, "column") : undefined;
  const text = said instanceof Error ? said.message : describedValue(said);
  return {
    line: typeof line === "number" ? line : undefined,
    column: typeof column === "number" ? column + 1 : undefined,
    said: withoutPlace(text.replace(`${file}: `, "")),
  };
}

/* The message without the place it ends with — "(3:12)" — and the space around it, read from
   its end: a pattern tried at each space of a long run, as /\s*\(\d+:\d+\)\s*$/ is, takes time
   growing with the square of the run. */
function withoutPlace(text: string): string {
  const ended = text.trimEnd();
  if (!ended.endsWith(")")) return text;
  const open = ended.lastIndexOf("(");
  if (open === -1 || !PLACE.test(ended.slice(open + 1, -1))) return text;
  return ended.slice(0, open).trimEnd();
}

/**
 * An import Node's resolution or the loader's did not find: the import, and
 * the module that made it, where the error names one.
 *
 * @param error - What the load threw
 * @returns The import and its importer; `undefined` for another failure
 * @example
 * ```ts
 * missingImport(error)?.specifier; // "server-only"
 * ```
 */
export function missingImport(
  error: unknown,
): { specifier: string; importer: string | undefined } | undefined {
  if (!(error instanceof Error)) return undefined;
  const code: unknown = Reflect.get(error, "code");
  if (code !== "MODULE_NOT_FOUND" && code !== "ERR_MODULE_NOT_FOUND") return undefined;
  const line = error.message.split("\n", 1)[0] ?? "";
  /* Node's messages, in every version Courier supports: "Cannot find module 'x'" from
     require, "Cannot find package 'x' imported from /a.js" from import. */
  const specifier = /^Cannot find (?:module|package) '([^']+)'/.exec(line)?.[1];
  if (specifier === undefined) return undefined;
  const stack: unknown = Reflect.get(error, "requireStack");
  const required = Array.isArray(stack) && typeof stack[0] === "string" ? stack[0] : undefined;
  return { specifier, importer: required ?? importerIn(line) };
}

/* The module after the first " imported from " that no line's end follows, to the line's end,
   found once: a pattern tried at each " imported from ", as / imported from (.+)$/ is, reads
   the rest of the line for each, in time growing with the square of the line. */
function importerIn(line: string): string | undefined {
  const after = Math.max(...LINE_ENDS.map((end) => line.lastIndexOf(end))) + 1;
  const at = line.indexOf(IMPORTED_FROM, after);
  const importer = at === -1 ? "" : line.slice(at + IMPORTED_FROM.length);
  return importer === "" ? undefined : importer;
}

/**
 * What was thrown, in a line to quote: an error's name and the first line of
 * its message, masked; any other value as text.
 *
 * @param error - What was thrown
 * @returns The line
 * @example
 * ```ts
 * described(new TypeError("Invalid URL")); // "TypeError: Invalid URL"
 * ```
 */
export function described(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${shownText(error.message)}`
    : shownText(describedValue(error));
}
