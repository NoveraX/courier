/**
 * The paths the module loader tries for an import, in the order it tries
 * them, so the dependency walk watches the file the loader evaluates.
 *
 * The loader is jiti, created with its default extensions (see
 * `createConfigJiti`). For a path, it first takes a regular file among: the
 * path itself; the path with each extension; the `index` file inside it with
 * each extension. JavaScript comes first, so a compiled `api.js` beside
 * `api.ts` is the one an extensionless import runs. Next it takes what Node's
 * own resolution makes of the path, which adds `.json`, `.node` and a
 * directory's `package.json` `main`. Last, it asks Node for the path with
 * each extension but `.js`, which Node tried, and the `index` file with it,
 * and, for a JavaScript extension, for the TypeScript file of the same name,
 * which is how `./api.js` written for NodeNext reaches `api.ts`. Node takes
 * any file there but a directory, a FIFO included. Node would also try its
 * own suffixes on each of those last paths, `api.ts.js` for one; no project
 * names a module so, and they are left out.
 */

import { join } from "node:path";

/** The extensions the loader tries on a path that names no file, in its order. */
export const LOADER_EXTENSIONS: ReadonlyArray<string> = [
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".mtsx",
  ".ctsx",
];

const JAVASCRIPT_EXTENSION = /\.([cm]?)j(sx?)$/;

/** What the loader tries for one path, before and after Node's own resolution. */
export interface LoaderCandidates {
  /** Tried first, in order, each taken only as a regular file: the path, with each extension, then its `index` files. */
  candidates: string[];
  /**
   * Tried in order once Node's resolution finds nothing, each taken as any
   * file but a directory: the path with each extension but `.js`, each
   * followed by its `index` file with that extension; after the first two,
   * the TypeScript file a JavaScript extension stands for.
   */
  fallbacks: string[];
}

/**
 * List the paths the loader tries for `base`, an import already resolved to
 * an absolute path, before and after asking Node.
 *
 * @param base - The absolute path an import spells, or an alias maps it to
 * @returns The candidates tried before Node's resolution, and the fallbacks
 *   tried after it
 *
 * @example
 * ```ts
 * loaderCandidates("/app/src/api").candidates;
 * // → ["/app/src/api", "/app/src/api.js", …, "/app/src/api/index.ctsx"]
 * loaderCandidates("/app/src/api.js").fallbacks;
 * // → ["/app/src/api.js.mjs", "/app/src/api.js/index.mjs", "/app/src/api.ts", "/app/src/api.js.cjs", …]
 * ```
 */
export function loaderCandidates(base: string): LoaderCandidates {
  const index = join(base, "index");
  const twin = JAVASCRIPT_EXTENSION.test(base)
    ? [base.replace(JAVASCRIPT_EXTENSION, ".$1t$2")]
    : [];
  const [first = [], ...rest] = LOADER_EXTENSIONS.filter((extension) => extension !== ".js").map(
    (extension) => [base + extension, index + extension],
  );
  return {
    candidates: [base, ...withExtensions(base), ...withExtensions(index)],
    fallbacks: [...first, ...twin, ...rest.flat()],
  };
}

function withExtensions(path: string): string[] {
  return LOADER_EXTENSIONS.map((extension) => path + extension);
}
