import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { COURIER_DIR } from "../../src/server/courier-dir";
import { DATABASE_FILE } from "../../src/server/storage/studio-db";

/**
 * Remove what Studio keeps in a project's `.courier` folder — the record of
 * its imports, their journal and backups — all but the database a running
 * Studio holds open, which Windows will not let anyone delete and which
 * keeps nothing of an import.
 *
 * @param root - The project's root
 * @example
 * ```ts
 * await post(url, "/api/apis/write", WRITE);
 * forgetCourierState(root); // Studio has no record of the import now
 * ```
 */
export function forgetCourierState(root: string): void {
  const folder = join(root, COURIER_DIR);
  if (!existsSync(folder)) return;
  for (const name of readdirSync(folder)) {
    if (name.startsWith(DATABASE_FILE)) continue;
    rmSync(join(folder, name), { recursive: true, force: true });
  }
}
