import type { DiffHunk, DiffLine } from "./wire-types";

import { isPlainObject } from "@/socket/is-plain-object";
import { isLineNumber } from "./is-line-number";

const LINE_KINDS: ReadonlySet<unknown> = new Set(["context", "add", "remove"]);

function isLineNumberOrNull(value: unknown): boolean {
  return value === null || isLineNumber(value);
}

/* A context line is in both files, an added line only in the new one, a
   removed line only in the old one. */
function isDiffLine(raw: unknown): raw is DiffLine {
  if (!isPlainObject(raw) || !LINE_KINDS.has(raw.kind) || typeof raw.text !== "string") {
    return false;
  }
  if (!isLineNumberOrNull(raw.oldLine) || !isLineNumberOrNull(raw.newLine)) return false;
  switch (raw.kind) {
    case "context":
      return raw.oldLine !== null && raw.newLine !== null;
    case "add":
      return raw.oldLine === null && raw.newLine !== null;
    default:
      return raw.oldLine !== null && raw.newLine === null;
  }
}

/**
 * Whether a value from Studio is one hunk of a diff: a plain object whose
 * `lines` are each a context, added or removed line, numbered on the side
 * of the file it is in.
 *
 * @param raw - One element of an answer's `hunks`
 * @returns Whether it can be shown as a hunk
 *
 * @example
 * ```ts
 * isDiffHunk({ lines: [{ kind: "add", text: "api", oldLine: null, newLine: 2 }] }); // → true
 * isDiffHunk({ lines: [{ kind: "add", text: "api", oldLine: 1, newLine: 2 }] }); // → false
 * ```
 */
export function isDiffHunk(raw: unknown): raw is DiffHunk {
  return (
    isPlainObject(raw) &&
    Array.isArray(raw.lines) &&
    raw.lines.length > 0 &&
    raw.lines.every(isDiffLine)
  );
}
