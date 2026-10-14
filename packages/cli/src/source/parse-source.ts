import type { Comment, Program } from "oxc-parser";
import { parseSync } from "oxc-parser";

/** Where each comment ends, by where it starts, so a scan can jump over one it lands on. */
export type CommentEnds = ReadonlyMap<number, number>;

/** The first problem oxc reported in a text. */
export interface ParseProblem {
  message: string;
  /** Where oxc pointed, or `null` when it pointed nowhere. */
  offset: number | null;
}

/** A source text and what oxc read from it. */
export interface ParsedSource {
  fileName: string;
  text: string;
  program: Program;
  comments: readonly Comment[];
  commentEnds: CommentEnds;
  /** The first error, or `null` when the text parsed cleanly. */
  problem: ParseProblem | null;
}

/**
 * Parse a TypeScript or JavaScript file, the language taken from its name.
 *
 * oxc reports spans as UTF-16 offsets into the string it was given, so they
 * index `text` directly; a leading BOM is kept and counts as offset 0.
 *
 * @param fileName - The file's name, whose extension picks the language
 * @param text - The file's text
 * @returns The program, its comments, and the first error if any
 *
 * @example
 * ```ts
 * parseSource("courier.mocks.ts", "export default {").problem?.message; // → "Expected `}` but found `EOF`"
 * ```
 */
export function parseSource(fileName: string, text: string): ParsedSource {
  const result = parseSync(fileName, text);
  const [first] = result.errors;
  const problem =
    first === undefined ? null : { message: first.message, offset: first.labels[0]?.start ?? null };
  return {
    fileName,
    text,
    program: result.program,
    comments: result.comments,
    commentEnds: new Map(result.comments.map((comment) => [comment.start, comment.end])),
    problem,
  };
}
