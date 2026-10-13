import type { PathStyle } from "./path-style";

/* `\\?\` before a Windows path lifts its length limit; the path is the same. */
const LONG_PATH_PREFIX = /^\\\\\?\\/;

/**
 * The folders of an absolute path, from its root: a POSIX root is an empty
 * name, a Windows path starts with its drive, and a separator at the end
 * names no folder.
 *
 * @param path - An absolute path
 * @param style - How the platform the path comes from spells paths
 * @returns The folders, in order
 * @example
 * ```ts
 * foldersOf("/Users/ana/", { windows: false, caseless: true }); // → ["", "Users", "ana"]
 * foldersOf("\\\\?\\C:\\Users\\ana", { windows: true, caseless: true }); // → ["C:", "Users", "ana"]
 * ```
 */
export function foldersOf(path: string, style: PathStyle): string[] {
  if (!style.windows) return path.replace(/\/+$/, "").split("/");
  return path
    .replace(LONG_PATH_PREFIX, "")
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/);
}
