import { describeError } from "../describe-error";
import type { ExclusiveContext } from "../exclusive-context";
import type { TextEdit } from "../mocks-edit/types";
import { sha256Hex } from "../sha256-hex";
import { ConfigEditRefusal } from "./config-edit-refusal";
import { replaceConfigFile } from "./replace-config-file";

/** One file a change to the project's config writes: as read, and as planned. */
export interface FileChange {
  /** Its absolute path. */
  path: string;
  /** Its path relative to the project root, for the messages. */
  file: string;
  /** Its text as read. */
  text: string;
  /** sha256 of the bytes read: the file is written only while it still holds them. */
  baseHash: string;
  /** Its permission bits, which the changed file keeps. */
  mode: number;
  /** Its text as planned. */
  planned: string;
  /** The edits from the text as read to the text as planned. */
  edits: TextEdit[];
}

/** What writing a change's files did. */
export type WrittenChanges =
  | { status: "written"; written: FileChange[] }
  /** A file changed since it was read; those written before it are back as they were. */
  | { status: "stale" }
  /** A file could not be written: why, with what became of those written before it. */
  | { status: "failed"; reason: string };

/**
 * Write a change's files in order, each in one step and only while it still
 * holds the bytes it was planned against. A file that changed meanwhile, or
 * could not be written, stops the change: the files written before it are
 * put back as they were, so the project never holds half of it.
 *
 * @param changes - The files, in the order they are written
 * @param tx - The edit, alone on the reload chain
 * @param root - The project root, for the messages
 * @returns The files written, or why none is left written
 * @example
 * ```ts
 * const outcome = writeFileChanges(prepared.plan, tx, root);
 * if (outcome.status === "written") await tx.load();
 * ```
 */
export function writeFileChanges(
  changes: readonly FileChange[],
  tx: ExclusiveContext,
  root: string,
): WrittenChanges {
  const written: FileChange[] = [];
  for (const change of changes) {
    try {
      replaceConfigFile(change.path, change.planned, {
        mode: change.mode,
        expectedHash: change.baseHash,
      });
      written.push(change);
    } catch (error) {
      const why = `Studio could not write ${change.file} (${describeError(error, root)})`;
      const reason = written.length > 0 ? restoreFileChanges(tx, written, why, root) : `${why}.`;
      return error instanceof ConfigEditRefusal
        ? { status: "stale" }
        : { status: "failed", reason };
    }
  }
  /* Written synchronously just above, so no watcher callback has run yet. */
  tx.acknowledge(written.map((change) => change.path));
  return { status: "written", written };
}

/**
 * Put back the files a change wrote, as they were before it, and finish
 * saying why: Studio never ran the changed files, so once they are back,
 * what is on disk is again what Studio runs. Only the text Studio wrote is
 * replaced: a save made since stays, and a file Studio could not put back is
 * reloaded as it is once the edit ends, the developer told to check it.
 *
 * @param tx - The edit, alone on the reload chain
 * @param written - The files the change wrote
 * @param why - Why the change is taken back, as the start of a sentence
 * @param root - The project root, for the messages
 * @returns The whole reason, with what became of each file
 * @example
 * ```ts
 * const reason = restoreFileChanges(tx, written, "courier.config.ts did not load once changed", root);
 * ```
 */
export function restoreFileChanges(
  tx: ExclusiveContext,
  written: readonly FileChange[],
  why: string,
  root: string,
): string {
  const back: string[] = [];
  const failed: string[] = [];
  for (const change of [...written].reverse()) {
    try {
      replaceConfigFile(change.path, change.text, {
        mode: change.mode,
        expectedHash: sha256Hex(change.planned),
      });
      tx.acknowledge([change.path]);
      back.unshift(change.file);
    } catch (error) {
      tx.reloadAfter([change.path]);
      failed.unshift(`${change.file} (${describeError(error, root)})`);
    }
  }
  if (failed.length === 0) {
    return `${why}, so Studio put ${listed(back)} back as ${back.length === 1 ? "it was" : "they were"}.`;
  }
  const also = back.length > 0 ? `put ${listed(back)} back, and ` : "";
  const files = written.filter((change) => !back.includes(change.file)).map((c) => c.file);
  return `${why}, and Studio ${also}could not put back ${listed(failed)}: check ${listed(files)}.`;
}

/**
 * Files named in a sentence: `a`, `a and b`, `a, b and c`.
 *
 * @param files - The files
 * @returns The list, as words
 * @example
 * ```ts
 * listed(["lib/sources.ts", "courier.config.ts"]); // → "lib/sources.ts and courier.config.ts"
 * ```
 */
export function listed(files: readonly string[]): string {
  if (files.length <= 1) return files.join("");
  return `${files.slice(0, -1).join(", ")} and ${files.at(-1)}`;
}
