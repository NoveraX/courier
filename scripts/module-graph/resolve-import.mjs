import { existsSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import nodePath from "node:path";

import { pathFrom, slashedPath } from "../slashed-paths.mjs";

/* What a bundler that builds a page resolves a package's `imports` and `exports` with. */
const PAGE_CONDITIONS = ["browser", "import", "default"];

/**
 * @typedef {{ name: string, root: string, exports: unknown, imports: Record<string, unknown> }} Package
 *   A package of the workspace: its name, its folder, and the `exports` and `imports` of its manifest
 */

/**
 * The target a conditional entry of a package's `imports` or `exports`
 * names for a page's bundle: the first condition, in the entry's own
 * order, that a page's bundler sets.
 *
 * @param {unknown} entry - The entry: a path, or conditions to paths
 * @returns {string | undefined} The path, or `undefined` when no condition applies
 * @example
 * pageTarget({ "edge-light": "./lib/*", browser: "./lib/browser/*", default: "./lib/*" }); // "./lib/browser/*"
 */
export function pageTarget(entry) {
  if (typeof entry === "string") return entry;
  if (entry === null || typeof entry !== "object") return undefined;
  for (const [condition, target] of Object.entries(entry)) {
    if (PAGE_CONDITIONS.includes(condition)) return pageTarget(target);
  }
  return undefined;
}

/**
 * Where a published module's import leads, as a page's bundler resolves
 * it: a relative path to the file it names; a specifier of its package's
 * own `imports`, and a workspace package named — itself among them —
 * through the target their page conditions pick; a built-in module of
 * Node to itself; any other package to its name.
 *
 * @param {string} specifier - What the import names
 * @param {string} importer - The importing module's file
 * @param {Package[]} packages - The workspace's packages a page's code may reach
 * @param {typeof nodePath} [paths] - The system's paths: Node's own by default
 * @returns {{ kind: "module", path: string } | { kind: "builtin", name: string } | { kind: "package", name: string } | { kind: "missing", reason: string }}
 * @example
 * resolveImport("./b.js", "/pkg/lib/a.js", [{ name: "pkg", root: "/pkg", exports: {}, imports: {} }]); // { kind: "module", path: "/pkg/lib/b.js" }
 */
export function resolveImport(specifier, importer, packages, paths = nodePath) {
  if (specifier.startsWith("node:") || builtinModules.includes(specifier.split("/")[0])) {
    return { kind: "builtin", name: specifier };
  }
  if (specifier.startsWith(".")) {
    return asFile(paths.resolve(paths.dirname(importer), specifier), specifier);
  }
  if (specifier.startsWith("#")) {
    const own = packageOf(importer, packages, paths);
    if (own === undefined)
      return { kind: "missing", reason: `${specifier} is imported by no package's module` };
    return fromMap(own.imports, specifier, own, specifier, "the package's imports", paths);
  }
  const { name, subpath } = splitPackage(specifier);
  const named = packages.find((pkg) => pkg.name === name);
  if (named === undefined) return { kind: "package", name };
  const exports = isSubpathMap(named.exports) ? named.exports : { ".": named.exports };
  return fromMap(exports, subpath, named, specifier, `the exports of ${name}`, paths);
}

/**
 * The package of the workspace a module lies in: the innermost one whose
 * folder holds it, the two paths compared by `/` however each is written.
 *
 * @param {string} path - The module's file
 * @param {Package[]} packages - The workspace's packages
 * @param {Pick<typeof nodePath, "sep">} [paths] - The system's paths: Node's own by default
 * @returns {Package | undefined} Its package, or `undefined` for none of them
 * @example
 * packageOf("/repo/packages/core/lib/a.js", packages)?.name; // "@noverax/courier"
 */
export function packageOf(path, packages, paths = nodePath) {
  const slashed = slashedPath(path, paths);
  return packages
    .filter((pkg) => slashed.startsWith(`${slashedPath(pkg.root, paths)}/`))
    .sort((a, b) => b.root.length - a.root.length)[0];
}

/* A package's name and the subpath of it an import names: `@scope/name/sub` is `@scope/name`, `./sub`. */
function splitPackage(specifier) {
  const parts = specifier.split("/");
  const length = specifier.startsWith("@") ? 2 : 1;
  const rest = parts.slice(length).join("/");
  return { name: parts.slice(0, length).join("/"), subpath: rest === "" ? "." : `./${rest}` };
}

/**
 * Whether a package's `exports` map subpaths, rather than give the root's
 * target or conditions alone.
 *
 * @param {unknown} exports - The `exports` of a manifest
 * @returns {boolean} `true` for a map of subpaths
 * @example
 * isSubpathMap({ ".": "./lib/index.js", "./client": "./lib/client.js" }); // true
 */
export function isSubpathMap(exports) {
  return (
    exports !== null &&
    typeof exports === "object" &&
    Object.keys(exports).some((key) => key.startsWith("."))
  );
}

/* The file an entry of `imports` or `exports` sends a key to, a pattern's `*` filled in. */
function fromMap(map, key, pkg, specifier, where, paths) {
  for (const [pattern, entry] of Object.entries(map ?? {})) {
    const star = pattern.indexOf("*");
    const matches =
      star === -1
        ? pattern === key
        : key.startsWith(pattern.slice(0, star)) && key.endsWith(pattern.slice(star + 1));
    if (!matches) continue;
    const target = pageTarget(entry);
    if (target === undefined)
      return { kind: "missing", reason: `${specifier} has no target for a page` };
    const filled =
      star === -1
        ? target
        : target.replace("*", key.slice(star, key.length - (pattern.length - star - 1)));
    return asFile(paths.join(pkg.root, filled), specifier);
  }
  return { kind: "missing", reason: `${specifier} is not in ${where}` };
}

function asFile(path, specifier) {
  if (existsSync(path) && statSync(path).isFile()) return { kind: "module", path };
  return { kind: "missing", reason: `${specifier} names ${path}, which is not there` };
}

/**
 * A module's path under the package's `lib`, as the sides name it.
 *
 * @param {string} lib - The package's `lib` folder
 * @param {string} path - The module's file
 * @param {Pick<typeof nodePath, "relative" | "sep">} [paths] - The system's paths: Node's own by default
 * @returns {string} Its path under `lib`, with forward slashes
 * @example
 * underLib("/pkg/lib", "/pkg/lib/adapter/limits.js"); // "adapter/limits.js"
 */
export function underLib(lib, path, paths = nodePath) {
  return pathFrom(lib, path, paths);
}
