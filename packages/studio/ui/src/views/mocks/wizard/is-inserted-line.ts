import type { InsertedLine } from "./wire-types";

import { isPlainObject } from "@/socket/is-plain-object";
import { isLineNumber } from "./is-line-number";

/**
 * Whether a value from Studio names a line it wrote into: its number in the
 * file as written, the whole line, and what Studio added on it.
 *
 * @param raw - One element of an answer's `insertedLines`
 * @returns Whether it can be shown as an inserted line
 *
 * @example
 * ```ts
 * isInsertedLine({ line: 4, text: "  api: defineMockServer({ source }),", added: "  api: defineMockServer({ source })," });
 * // → true
 * ```
 */
export function isInsertedLine(raw: unknown): raw is InsertedLine {
  return (
    isPlainObject(raw) &&
    isLineNumber(raw.line) &&
    typeof raw.text === "string" &&
    typeof raw.added === "string"
  );
}
