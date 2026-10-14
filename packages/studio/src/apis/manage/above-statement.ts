import type { ParsedSource } from "@noverax/courier-cli/devkit";
import { BYTE_ORDER_MARK } from "../../server/mocks-edit/plan/byte-order-mark";
import { lineStart } from "../../server/mocks-edit/plan/line-start";

/**
 * Where code inserted above a top-level statement goes: at the start of the
 * line holding the first of the comments right above it, so a doc comment
 * stays attached to its statement, and never before a byte order mark.
 *
 * @param parsed - The parsed file
 * @param start - Where the statement starts
 * @returns The offset to insert at
 * @example
 * ```ts
 * insertion(aboveStatement(parsed, declaration.statement.start), preamble);
 * ```
 */
export function aboveStatement(parsed: ParsedSource, start: number): number {
  const { text } = parsed;
  let at = start;
  for (const comment of [...parsed.comments].reverse()) {
    if (comment.end > at) continue;
    /* Only a comment on lines of its own is the statement's; one closing a line of code is that code's. */
    const ownLine =
      text
        .slice(lineStart(text, comment.start), comment.start)
        .replace(BYTE_ORDER_MARK, "")
        .trim() === "";
    if (!ownLine || text.slice(comment.end, at).trim() !== "") break;
    at = comment.start;
  }
  const line = lineStart(text, at);
  return line === 0 && text.startsWith(BYTE_ORDER_MARK) ? BYTE_ORDER_MARK.length : line;
}
