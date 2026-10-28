import { statSync } from "node:fs";

import { UntrustedConfigError } from "./untrusted-config-error";

/* Write permission for users outside the owner's group. */
const OTHERS_WRITE = 0o002;

/**
 * Refuse a config found in a folder above the one it was looked for from,
 * unless it belongs to this process's user or to the owner of that folder,
 * and no user outside its group may write it. A folder many users share,
 * such as `/tmp`, lets anyone put a config there, and it would run with the
 * rights of whoever builds a project below it. Windows has no owner of that
 * kind, so nothing is refused there.
 *
 * @param configFile - The config found, absolute
 * @param folder - The folder it was looked for from, absolute
 * @throws UntrustedConfigError when someone else could have put it there
 * @example
 * ```ts
 * assertOwnConfig("/repo/courier.config.ts", "/repo/apps/web");
 * ```
 */
export function assertOwnConfig(configFile: string, folder: string): void {
  const uid = process.getuid?.();
  if (uid === undefined) return;
  const stats = statSync(configFile);
  /* A folder that is not there has no owner to speak for it. */
  const folderOwner = statSync(folder, { throwIfNoEntry: false })?.uid ?? uid;
  if (stats.uid !== uid && stats.uid !== folderOwner) {
    throw new UntrustedConfigError(
      configFile,
      folder,
      `it belongs to uid ${stats.uid}, neither this user (${uid}) nor the owner of the folder (${folderOwner})`,
    );
  }
  if ((stats.mode & OTHERS_WRITE) !== 0) {
    throw new UntrustedConfigError(configFile, folder, "any user may write it");
  }
}
