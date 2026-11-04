import { resolve, sep } from "node:path";

/* How Windows writes a path in its own namespace, as `path.toNamespacedPath` does: a drive's, then a share's. */
const NAMESPACE = "\\\\?\\";
const SHARE_NAMESPACE = "\\\\?\\UNC\\";

/**
 * A path as this system names it: absolute, written with its own
 * separator, `.` and `..` resolved, and on Windows out of the namespace
 * `path.toNamespacedPath` writes it in (`\\?\D:\app` is `D:\app`). The code
 * a reading runs may name one file in any of these ways; a watcher reports
 * it in this one.
 *
 * @param path - The path, absolute or from the working folder
 * @returns The path
 * @example
 * ```ts
 * localPath("/app/src/../flags.json"); // "/app/flags.json"
 * ```
 */
export function localPath(path: string): string {
  if (sep === "\\" && path.startsWith(SHARE_NAMESPACE)) {
    return resolve(`\\\\${path.slice(SHARE_NAMESPACE.length)}`);
  }
  if (sep === "\\" && path.startsWith(NAMESPACE)) return resolve(path.slice(NAMESPACE.length));
  return resolve(path);
}
