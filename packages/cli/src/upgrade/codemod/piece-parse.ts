import { parseSync } from "oxc-parser";

import { type AstNode, programOf } from "./ast";
import type { CodePiece } from "./source-files";

/** A piece's parse: its first problem, and its tree, which oxc builds only when a migration asks for it. */
export interface PieceParse {
  readonly problem: { readonly message: string; readonly at: number } | null;
  readonly program: () => AstNode;
}

/**
 * Parse a piece of a file's code with oxc, as the language its file
 * writes: its first problem at once, and its tree when it is first asked
 * for, once.
 *
 * @param piece - The piece
 * @param text - Its text, as the migrations before left it
 * @returns The parse
 * @example
 * ```ts
 * parsePiece(piece, text).problem; // null where it parses
 * ```
 */
export function parsePiece(piece: CodePiece, text: string): PieceParse {
  const parsed = parseSync(`piece${piece.parseAs}`, text);
  const [first] = parsed.errors;
  let program: AstNode | undefined;
  return {
    problem:
      first === undefined ? null : { message: first.message, at: first.labels[0]?.start ?? 0 },
    program: () => {
      program ??= programOf(parsed.program);
      return program;
    },
  };
}
