import { copyFile, mkdir, readdir, readFile, rm, rmdir, stat } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Bring copies of Courier's icons up to date: each written where it is
 * missing or differs from the icon Courier ships, the rest left alone.
 *
 * @param copies - Each icon Courier ships, by the path of its copy
 * @returns Whether any copy was written
 * @example
 * ```ts
 * await copyIcons(new Map([[join(home, "courier-config.svg"), join(iconsDir, "courier-config.svg")]]));
 * ```
 */
export async function copyIcons(copies: ReadonlyMap<string, string>): Promise<boolean> {
  let written = false;
  for (const [copy, icon] of copies) {
    const [ours, theirs] = await Promise.all([
      readFile(icon),
      readFile(copy).catch(() => undefined),
    ]);
    if (theirs?.equals(ours)) continue;
    await mkdir(dirname(copy), { recursive: true });
    await copyFile(icon, copy);
    written = true;
  }
  return written;
}

/**
 * Take copies of Courier's icons away — and the folder Courier keeps them
 * in, when named and left empty.
 *
 * @param copies - The copies' paths
 * @param folder - Courier's own folder of copies, taken away once empty
 * @returns Whether any copy was there
 * @example
 * ```ts
 * await removeCopies([join(home, "courier-config.svg")], home);
 * ```
 */
export async function removeCopies(copies: Iterable<string>, folder?: string): Promise<boolean> {
  let removed = false;
  for (const copy of copies) {
    if (!(await stat(copy).catch(() => undefined))) continue;
    await rm(copy, { force: true });
    removed = true;
  }
  const left = folder ? await readdir(folder).catch(() => undefined) : undefined;
  if (folder && left?.length === 0) await rmdir(folder);
  return removed;
}
