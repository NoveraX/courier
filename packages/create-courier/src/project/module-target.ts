import { posix } from "node:path";

import { aliasedFiles } from "./path-aliases";
import type { Project } from "./read-project";

const EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;
/* The aliases frameworks give without the project's tsconfig naming them: `@/`, `~/`, `~~/`, `#shared/`, `$lib/`, or a path from the root. */
const CONVENTIONAL = /^(?:@\/|@@\/|~~?\/|#|\$|src\/)/;

/**
 * A path as a framework's own alias may name it, where the project's
 * configuration does not say how: its last two segments.
 *
 * @param path - The file, relative to the root, without extension
 * @returns The key
 * @example
 * ```ts
 * tailKey("src/lib/courier/caller"); // "tail:courier/caller"
 * ```
 */
export function tailKey(path: string): string {
  return `tail:${path.split("/").slice(-2).join("/")}`;
}

/**
 * The files of the project's own a file's specifier may load, each without
 * extension and with the index of a folder: a relative path read from the
 * file, an alias read as the project's tsconfig `paths`, `baseUrl` and
 * package.json `imports` resolve it, and a framework's own alias by the
 * last two segments of what it names. A package's name loads none.
 *
 * @param project - The project
 * @param from - The importing file, relative to the root
 * @param specifier - The specifier, as the file writes it
 * @returns The paths, and the keys of a framework's alias
 * @example
 * ```ts
 * targetsOf(project, "src/server.ts", "./courier/routes.js"); // ["src/courier/routes", "src/courier/routes/index"]
 * ```
 */
export function targetsOf(project: Project, from: string, specifier: string): string[] {
  const plain = specifier.replace(EXTENSION, "");
  const paths = plain.startsWith(".")
    ? [posix.normalize(posix.join(posix.dirname(from), plain))]
    : aliasedFiles(project, specifier);
  const conventional =
    !plain.startsWith(".") && CONVENTIONAL.test(plain)
      ? [tailKey(plain.replace(/^(?:@@?|~~?)\//, ""))]
      : [];
  return [...paths.flatMap((path) => [path, `${path}/index`]), ...conventional];
}

/**
 * Whether a specifier a file writes loads a given file of the project's.
 *
 * @param project - The project
 * @param from - The importing file, relative to the root
 * @param specifier - The specifier, as the file writes it
 * @param target - The file, relative to the root, with or without extension
 * @returns Whether it does
 * @example
 * ```ts
 * loadsFile(project, "src/server.ts", "@server/courier/routes", "src/courier/routes.ts"); // true where tsconfig maps "@server/*"
 * ```
 */
export function loadsFile(
  project: Project,
  from: string,
  specifier: string,
  target: string,
): boolean {
  const bare = target.replace(EXTENSION, "");
  const targets = targetsOf(project, from, specifier);
  return targets.includes(bare) || targets.includes(tailKey(bare));
}
