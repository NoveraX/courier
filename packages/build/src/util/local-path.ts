import { posix, win32 } from "node:path";

/* How Windows writes a path in its own namespace, as `path.toNamespacedPath` does: a drive's, then a share's. */
const NAMESPACE = "\\\\?\\";
const SHARE_NAMESPACE = "\\\\?\\UNC\\";

/**
 * A path as this system names it: absolute, written with its own
 * separator, `.` and `..` resolved, and on Windows out of the namespace
 * `path.toNamespacedPath` writes it in (`\\?\D:\app` is `D:\app`). The code
 * a reading runs may name one file in any of these ways, and the loader
 * writes a path with `/` on Windows too; a watcher reports it in this one.
 * The system is the one `process.platform` names, as Node's `path` reads it.
 *
 * @param path - The path, absolute or from the working folder
 * @returns The path
 * @example
 * ```ts
 * localPath("/app/src/../flags.json"); // "/app/flags.json"
 * localPath("D:/a/app/src/api.ts"); // on Windows → "D:\\a\\app\\src\\api.ts"
 * ```
 */
export function localPath(path: string): string {
  if (process.platform !== "win32") return posix.resolve(path);
  if (path.startsWith(SHARE_NAMESPACE)) {
    return win32.resolve(`\\\\${path.slice(SHARE_NAMESPACE.length)}`);
  }
  if (path.startsWith(NAMESPACE)) return win32.resolve(path.slice(NAMESPACE.length));
  return win32.resolve(path);
}
