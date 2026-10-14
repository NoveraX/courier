import * as nodePath from "node:path";
import { isWithin } from "./is-within";
import type { PathApi } from "./path-api";
import { PathOutsideProjectError } from "./path-outside-project-error";

const DRIVE_PREFIX = /^[A-Za-z]:/;
const SEPARATORS = /[\\/]/;

/**
 * Resolve a project-relative path, refusing by its name alone any path that
 * could reach outside the project: an absolute path, one that names a drive
 * (`C:x` is relative to that drive's own directory on Windows), a network
 * share, a NUL byte, a `:` inside a name (an NTFS stream) or a `..` that
 * climbs out.
 *
 * The check is lexical; a symbolic link on the way is
 * {@link assertRealInside}'s concern.
 *
 * @param root - The absolute project directory
 * @param path - The path, relative to the project, with `/` or `\` separators
 * @param api - The path rules to resolve with; the platform's by default
 * @returns The absolute path
 * @throws {PathOutsideProjectError} When the path is refused
 * @example
 * ```ts
 * resolveProjectPath("/proj", "src/api/pets/index.ts"); // "/proj/src/api/pets/index.ts"
 * resolveProjectPath("/proj", "../other/a.ts"); // throws
 * ```
 */
export function resolveProjectPath(root: string, path: string, api: PathApi = nodePath): string {
  const problem = lexicalProblem(path);
  if (problem !== null) throw new PathOutsideProjectError(path, problem);
  const resolved = api.resolve(root, path);
  if (!isWithin(root, resolved, api)) {
    throw new PathOutsideProjectError(path, "it leaves the project");
  }
  return resolved;
}

/**
 * Why a project-relative path is refused, by its name alone, as
 * {@link resolveProjectPath} refuses it, with no project at hand: what a
 * config names is checked before the project it is in is known.
 *
 * @param path - The path, relative to the project, with `/` or `\` separators
 * @returns Why it is refused, completing "the path is refused: ", or `null`
 * @example
 * ```ts
 * projectPathProblem("src/courier.routes.ts"); // → null
 * projectPathProblem("../web/courier.routes.ts"); // → "it leaves the project"
 * ```
 */
export function projectPathProblem(path: string): string | null {
  const problem = lexicalProblem(path);
  if (problem !== null) return problem;
  const root = "/project";
  const resolved = nodePath.posix.resolve(root, path.replaceAll("\\", "/"));
  return isWithin(root, resolved, nodePath.posix) ? null : "it leaves the project";
}

function lexicalProblem(path: string): string | null {
  if (path === "") return "it is empty";
  if (path.includes("\0")) return "it contains a NUL byte";
  if (nodePath.posix.isAbsolute(path) || nodePath.win32.isAbsolute(path)) return "it is absolute";
  if (DRIVE_PREFIX.test(path)) return "it names a drive";
  if (path.split(SEPARATORS).some((name) => name.includes(":"))) return "a name in it holds ':'";
  return null;
}
