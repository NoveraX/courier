import type { TextEdit } from "../types";

/**
 * An insertion of `text` at `at`: an edit that replaces nothing.
 *
 * @param at - A UTF-16 offset into the text before the edit
 * @param text - What to insert
 * @returns The edit
 *
 * @example
 * ```ts
 * insertion(3, "x"); // → { start: 3, end: 3, text: "x" }
 * ```
 */
export function insertion(at: number, text: string): TextEdit {
  return { start: at, end: at, text };
}
