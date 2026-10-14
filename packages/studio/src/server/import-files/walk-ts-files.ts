import { type Dirent, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { errnoCode } from "@noverax/courier-cli/devkit";

/**
 * Visit every `.ts` file under a directory, never following a link: a link
 * to a directory is not entered and a link to a file is not visited. A
 * directory that is not there has no files.
 *
 * @param dir - The absolute directory
 * @param visit - Called with each file's absolute path
 * @example
 * ```ts
 * walkTsFiles(join(root, "src/api/pets"), (file) => files.push(file));
 * ```
 */
export function walkTsFiles(dir: string, visit: (file: string) => void): void {
  let entries: Dirent[];
  try {
    /* The folder walked from may itself be a link, which is not entered either. */
    if (!lstatSync(dir).isDirectory()) return;
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    const code = errnoCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") return;
    throw error;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkTsFiles(path, visit);
    else if (entry.isFile() && entry.name.endsWith(".ts")) visit(path);
  }
}
