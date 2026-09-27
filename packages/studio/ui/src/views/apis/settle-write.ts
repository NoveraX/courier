import type { ImportState } from "./types";

import { isPlainObject } from "@/socket/is-plain-object";
import { readImportDeclaration } from "./read-import-declaration";

/** What the import wizard does once Studio wrote an import's files. */
export interface WriteSettlement {
  /** The wizard's next state: the declare step while courier.config lacks part of the declaration. */
  state: ImportState;
  /** What to tell the user: the files written, and nothing Studio did not do. */
  message: string;
}

/**
 * Settle the wizard after Studio answered a write. Studio writes the files
 * and changes no config, so the message says only that; when the answer
 * names what courier.config must still declare, the wizard moves to the
 * declare step to show it, and otherwise it has nothing left to show.
 *
 * @param state - The wizard's state the write was sent from
 * @param reply - The decoded body of `POST /api/apis/write`
 * @returns The next state, and the message
 *
 * @example
 * ```ts
 * const { state: next, message } = settleWrite(state, { written: 4, declaration });
 * next.step; // → "declare"
 * message; // → "Wrote 4 files for pets"
 * ```
 */
export function settleWrite(state: ImportState, reply: unknown): WriteSettlement {
  const written =
    isPlainObject(reply) && typeof reply.written === "number"
      ? reply.written
      : state.generatedFiles.length;
  const message = `Wrote ${written} ${written === 1 ? "file" : "files"} for ${state.options.sourceName}`;
  const declaration = readImportDeclaration(reply);
  if (declaration === null) return { state: { ...state, declaration: null }, message };
  return { state: { ...state, step: "declare", declaration }, message };
}
