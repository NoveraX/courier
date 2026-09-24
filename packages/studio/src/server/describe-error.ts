import { sep } from "node:path";
import { messageOf } from "./message-of";

/**
 * An error as one line a developer reads in the wizard: its message with the
 * project root taken off every path and line breaks folded, since the
 * loader's messages span lines and name files by absolute path. The terminal
 * log keeps the error whole.
 *
 * @param error - What was thrown
 * @param root - The project root, symlinks resolved, when paths should be shown relative to it
 * @returns The message on one line
 *
 * @example
 * ```ts
 * describeError(new Error("ParseError: Unexpected token \n /app/courier.mocks.ts:3:2"), "/app");
 * // → "ParseError: Unexpected token courier.mocks.ts:3:2"
 * ```
 */
export function describeError(error: unknown, root?: string): string {
  const message = messageOf(error);
  const relative = root ? withoutRoot(message, root) : message;
  return relative.replace(/\s+/g, " ").trim();
}

/* Only where a path starts — at the start of the message, or after a space,
   a quote, a bracket, a colon or an equals sign — so a longer path that merely
   contains the root is left whole. */
function withoutRoot(message: string, root: string): string {
  const escaped = (root + sep).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return message.replace(new RegExp(`(^|[\\s'"(\\[:=])${escaped}`, "g"), "$1");
}
