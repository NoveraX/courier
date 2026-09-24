import type { Comment } from "oxc-parser";

/* The comments TypeScript reads as pragmas, by the form each takes; names
   are matched without regard to case, as TypeScript matches them. A comment's
   value is its text without the `//`, or without the `/*` and `*\/`. */
const TRIPLE_SLASH = /^\/\s*<(?:reference|amd-dependency|amd-module)\s/i;
const LINE_PRAGMA = /^\/?\s*@(?:ts-check|ts-nocheck)(?:[\s:]|$)/i;
const BLOCK_PRAGMA = /@(?:jsx|jsxfrag|jsximportsource|jsxruntime)(?:\s|$)/im;

/**
 * Whether a comment is one TypeScript reads for the whole file: a
 * triple-slash directive (`/// <reference ... />`, `/// <amd-module ... />`,
 * `/// <amd-dependency ... />`), a `// @ts-check` or `// @ts-nocheck`, or a
 * `/* @jsx ... *\/`, `@jsxFrag`, `@jsxImportSource` or `@jsxRuntime` pragma.
 * TypeScript honours these only among the comments above a file's first
 * statement, so nothing may be inserted above one.
 *
 * @param comment - A comment as oxc reports it
 * @returns Whether it is a triple-slash directive or a file-wide pragma
 *
 * @example
 * ```ts
 * isFilePragma({ type: "Line", value: " @ts-nocheck", start: 0, end: 14 }); // → true
 * isFilePragma({ type: "Line", value: " @ts-expect-error", start: 0, end: 19 }); // → false
 * ```
 */
export function isFilePragma(comment: Comment): boolean {
  if (comment.type === "Block") return BLOCK_PRAGMA.test(comment.value);
  return TRIPLE_SLASH.test(comment.value) || LINE_PRAGMA.test(comment.value);
}
