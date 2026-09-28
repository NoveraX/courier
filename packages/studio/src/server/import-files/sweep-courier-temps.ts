import { readdirSync } from "node:fs";
import { join } from "node:path";
import { COURIER_DIR, hasCourierSubdir } from "../courier-dir";
import { discardTemp } from "../project-fs/discard-temp";
import { runsElsewhere } from "./runs-elsewhere";

/* The temporary files Studio saves its imports state and its journals through, named for the process writing them. */
const STATE_TEMP = /^\.courier\.state\.(\d+)-[0-9a-f]{8}\.tmp$/;
const JOURNAL_TEMP = /^\.courier\.journal\.(\d+)-[0-9a-f]{8}\.tmp$/;

function sweep(dir: string, name: RegExp): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const pid = entry.isFile() ? name.exec(entry.name)?.[1] : undefined;
    /* One that a Studio still running is writing is about to take its file's name. */
    if (pid !== undefined && !runsElsewhere(Number(pid))) discardTemp(join(dir, entry.name));
  }
}

/**
 * Delete the temporary files a crash left while Studio saved its imports
 * state or a journal: only files named as Studio names them, in real
 * folders of `.courier`, and none that a Studio still running is writing.
 *
 * @param root - The project root
 * @throws {CourierDirUnsafeError} When `.courier` or its journal folder is a link or not a folder
 * @example
 * ```ts
 * sweepCourierTemps(root);
 * ```
 */
export function sweepCourierTemps(root: string): void {
  if (!hasCourierSubdir(root, "journal")) return;
  sweep(join(root, COURIER_DIR), STATE_TEMP);
  sweep(join(root, COURIER_DIR, "journal"), JOURNAL_TEMP);
}
