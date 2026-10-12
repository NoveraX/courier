import { createHash } from "node:crypto";
import { mkdir, readdir, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { ICONS_HOME } from "./icon-files";

/** The profiles on this computer that use one folder of Courier's icon copies. */
export interface IconUsers {
  /** Whether this profile is one of them */
  has(): Promise<boolean>;
  /** Count this profile in */
  add(): Promise<void>;
  /** Count this profile out, when it was in, and say whether no profile uses the copies now */
  release(): Promise<boolean>;
}

/**
 * The profiles on this computer that use one folder of Courier's icon
 * copies — an empty file for each, under Courier's folder in the editor's
 * extensions folder. Every profile shares the extensions folder and
 * vscode-icons' custom icons folder, while each has settings of its own:
 * the copies go only once no profile that put them in uses them, never
 * because a profile that never did lacks them.
 *
 * @param extensionsDir - The editor's extensions folder, the theme's parent
 * @param copies - The folder that holds the copies
 * @param profile - What tells this profile from the others: its storage folder
 * @returns The profiles that use the copies
 * @example
 * ```ts
 * const users = iconUsers(dirname(material.extensionPath), home, context.globalStorageUri.toString());
 * if (await users.release()) await removeCopies(files, home);
 * ```
 */
export function iconUsers(extensionsDir: string, copies: string, profile: string): IconUsers {
  const users = join(extensionsDir, ICONS_HOME, "users");
  const folder = join(users, digest(copies));
  const mark = join(folder, digest(profile));
  return {
    has: async () => (await stat(mark).catch(() => undefined)) !== undefined,
    async add() {
      await mkdir(folder, { recursive: true });
      await writeFile(mark, "");
    },
    async release() {
      await rm(mark, { force: true });
      const left = await readdir(folder).catch(() => []);
      if (left.length > 0) return false;
      await removeEmpty([folder, users, dirname(users)]);
      return true;
    },
  };
}

/* Each folder, innermost first, while it is there and empty. */
async function removeEmpty(folders: readonly string[]): Promise<void> {
  for (const folder of folders) {
    const left = await readdir(folder).catch(() => undefined);
    if (left?.length !== 0) return;
    await rmdir(folder);
  }
}

/* A short name that tells paths apart without saying whose they are. */
function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
