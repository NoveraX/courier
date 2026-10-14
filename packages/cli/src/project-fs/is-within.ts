import * as nodePath from "node:path";
import type { PathApi } from "./path-api";

/**
 * Tell whether a path is a directory or lies inside it, comparing resolved
 * paths the way the platform does: on Windows across `\` and `/`, drive
 * letters in any case, and without mistaking `C:\proj-other` for a path
 * inside `C:\proj`.
 *
 * Both paths must already be absolute. This is a comparison of names only;
 * whether a link on the way leads elsewhere is {@link assertRealInside}'s
 * question.
 *
 * @param parent - The directory
 * @param child - The path to test
 * @param api - The path rules to compare with; the platform's by default
 * @returns `true` when `child` is `parent` or inside it
 * @example
 * ```ts
 * isWithin("/proj", "/proj/src/a.ts"); // true
 * isWithin("/proj", "/proj-other/a.ts"); // false
 * isWithin("C:\\proj", "c:\\PROJ\\src", path.win32); // true
 * ```
 */
export function isWithin(parent: string, child: string, api: PathApi = nodePath): boolean {
  const relative = api.relative(parent, child);
  if (relative === "") return true;
  if (api.isAbsolute(relative)) return false;
  return relative.split(api.sep)[0] !== "..";
}
