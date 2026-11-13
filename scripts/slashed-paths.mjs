/// <reference types="node" />
/**
 * Paths in the one form the checks compare on every system: their parts
 * split by `/`, as git, the docs and a fence's `file` write them, where
 * Windows writes `\`. A check that names the files it reads in this form
 * finds the same files, and says the same of them, on Windows as on macOS
 * and Linux.
 */

import nodePath from "node:path";

/**
 * A path as the checks compare it: by `/`, however the system writes it.
 *
 * @param {string} path - The path, as the system writes it
 * @param {Pick<typeof nodePath, "sep">} [paths] - The system's paths: Node's own by default
 * @returns {string} The path, by `/`
 * @example
 * slashedPath("actions\\page.tsx", nodePath.win32); // → "actions/page.tsx"
 */
export function slashedPath(path, paths = nodePath) {
  return path.split(paths.sep).join("/");
}

/**
 * A file's path from a folder, as the checks compare it.
 *
 * @param {string} from - The folder, as the system writes it
 * @param {string} file - The file, as the system writes it
 * @param {Pick<typeof nodePath, "relative" | "sep">} [paths] - The system's paths: Node's own by default
 * @returns {string} The path from the folder to the file, by `/`
 * @example
 * pathFrom("C:\\repo", "C:\\repo\\docs\\installation.mdx", nodePath.win32); // → "docs/installation.mdx"
 */
export function pathFrom(from, file, paths = nodePath) {
  return slashedPath(paths.relative(from, file), paths);
}
