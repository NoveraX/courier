import { type Dirent, readdirSync } from "node:fs";
import { join } from "node:path";
import { errnoCode } from "../errno-code";

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
