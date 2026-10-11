import { isDiffHunk } from "@/features/mocks/wizard/is-diff-hunk";
import type { DiffHunk } from "@/features/mocks/wizard/wire-types";
import { isPlainObject } from "@/socket/is-plain-object";

/** One file a change to the project's config writes, with the lines it changes. */
export interface FileHunks {
  /** The file, relative to the project root. */
  file: string;
  /** Every line the change adds or removes, between the lines around it. */
  hunks: DiffHunk[];
}

/**
 * Read the files a change to the config writes, as Studio's preview lists
 * them: the config, and the module it takes its `sources` from when the
 * change writes that too. Every file is checked, and a list with one that
 * is not whole is no list at all.
 *
 * @param raw - The preview's `files`
 * @returns The files, in the order Studio writes them, or `null` when the answer is not a list of them
 * @example
 * ```ts
 * readFileHunks([{ file: "courier.config.ts", hunks }]); // → [{ file: "courier.config.ts", hunks }]
 * readFileHunks([]); // → null
 * ```
 */
export function readFileHunks(raw: unknown): FileHunks[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const files: FileHunks[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) return null;
    const { file, hunks } = entry;
    if (typeof file !== "string" || file === "") return null;
    if (!Array.isArray(hunks) || !hunks.every(isDiffHunk)) return null;
    files.push({ file, hunks });
  }
  return files;
}
