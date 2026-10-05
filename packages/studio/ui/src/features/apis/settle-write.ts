import type { ImportState } from "@/features/apis/types";
import { isPlainObject } from "@/socket/is-plain-object";
import { appliedMessage } from "./applied-notes";
import { readImportDeclaration } from "./read-import-declaration";

/** What the import wizard does once Studio wrote an import's files. */
export interface WriteSettlement {
  /** The wizard's next state: the declare step while courier.config lacks part of the declaration. */
  state: ImportState;
  /** What to tell the user: what happened to the files, and nothing Studio did not do. */
  message: string;
}

function countOf(reply: unknown, key: "written" | "removed" | "kept" | "leftBehind"): number {
  const list = isPlainObject(reply) ? reply[key] : undefined;
  return Array.isArray(list) ? list.length : 0;
}

function unremovedOf(reply: unknown): string[] {
  const list = isPlainObject(reply) ? reply.pruneFailures : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap((failure) =>
    isPlainObject(failure) && typeof failure.path === "string" ? [failure.path] : [],
  );
}

function writeMessage(name: string, reply: unknown): string {
  const counts = {
    written: countOf(reply, "written"),
    removed: countOf(reply, "removed"),
    kept: countOf(reply, "kept"),
    leftBehind: countOf(reply, "leftBehind"),
    unremoved: unremovedOf(reply),
  };
  const unchanged = [counts.written, counts.removed, counts.kept, counts.leftBehind].every(
    (n) => n === 0,
  );
  if (unchanged && counts.unremoved.length === 0)
    return `${name} is already as Studio generates it`;
  return appliedMessage(name, counts);
}

/**
 * Settle the wizard after Studio answered a write. Studio writes the files
 * and changes no config, so the message says only what happened to the
 * files; when the answer names what courier.config must still declare, the
 * wizard moves to the declare step to show it, and otherwise it has nothing
 * left to show.
 *
 * @param state - The wizard's state the write was sent from
 * @param reply - The decoded body of `POST /api/apis/write`
 * @returns The next state, and the message
 *
 * @example
 * ```ts
 * const { state: next, message } = settleWrite(state, { written: ["src/api/pets/source.ts", "src/api/pets/index.ts"], declaration });
 * next.step; // → "declare"
 * message; // → "pets: wrote 2 files"
 * ```
 */
export function settleWrite(state: ImportState, reply: unknown): WriteSettlement {
  const message = writeMessage(state.options.sourceName, reply);
  const settled = { ...state, consent: null };
  const declaration = readImportDeclaration(reply);
  if (declaration === null) return { state: { ...settled, declaration: null }, message };
  return { state: { ...settled, step: "declare", declaration }, message };
}
