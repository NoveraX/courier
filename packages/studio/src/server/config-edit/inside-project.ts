import { isAbsolute, relative, sep } from "node:path";

/**
 * Whether a file is one of the project's own: inside its root, and in no
 * `node_modules` — a file Studio may change for the developer.
 *
 * @param root - The project root, links resolved
 * @param file - The file, absolute, links resolved
 * @returns Whether it is the project's
 * @example
 * ```ts
 * insideProject("/app", "/app/lib/sources.ts"); // → true
 * insideProject("/app", "/app/node_modules/x/index.ts"); // → false
 * ```
 */
export function insideProject(root: string, file: string): boolean {
  const path = relative(root, file);
  return (
    path !== "" &&
    !path.startsWith("..") &&
    !isAbsolute(path) &&
    !path.split(sep).includes("node_modules")
  );
}
