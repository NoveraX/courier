/**
 * Deciding what order a workspace may be published in.
 *
 * A package must reach the registry after everything it depends on, or there
 * is a window — and on a failed run, a permanent state — in which installing
 * it cannot resolve. Sorting by "has internal dependencies" does not express
 * that: it is a partition, and it leaves every package on the same side of it
 * in whatever order the filesystem happened to return.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  /** An editor extension's publisher, and the extensions it installs */
  publisher?: string;
  extensionPack?: string[];
  extensionDependencies?: string[];
}

/** Packages under this scope are the ones published together. */
export const SCOPE = "@noverax/";

export function readPkg(pkgDir: string): PackageJson {
  return JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
}

/** Every package directory, in a stable listing order, with what its manifest says. */
function workspaces(): Array<{ dir: string; pkg: PackageJson }> {
  return (
    readdirSync("packages")
      .sort()
      /* Written with forward slashes on every system: a folder is named as the repository names it. */
      .map((name) => posix.join("packages", name))
      .filter((dir) => statSync(join(dir, "package.json"), { throwIfNoEntry: false })?.isFile())
      .map((dir) => ({ dir, pkg: readPkg(dir) }))
  );
}

/** Every publishable package directory, in a stable listing order. */
export function packageDirs(): string[] {
  return workspaces()
    .filter(({ pkg }) => !pkg.private)
    .map(({ dir }) => dir);
}

/**
 * The editor extensions: released with the packages, at their version, but
 * published to the extension marketplaces rather than to npm.
 *
 * @returns The directories of the packages that name the VS Code version they need
 * @example
 * ```ts
 * extensionDirs(); // ["packages/vscode", "packages/vscode-file-icons"]
 * ```
 */
export function extensionDirs(): string[] {
  return workspaces()
    .filter(({ pkg }) => pkg.engines?.vscode !== undefined)
    .map(({ dir }) => dir);
}

/**
 * Order names so each one follows the names it depends on.
 *
 * Ties are broken by name rather than by whatever order the filesystem
 * returned, so two runs from the same commit produce the same order.
 *
 * @param needs - Each name mapped to the names it must follow
 * @returns The names in an order that satisfies every edge
 * @throws When the graph contains a cycle, naming the packages involved
 *
 * @example
 * ```ts
 * orderByDependency(new Map([["b", ["a"]], ["a", []]])); // ["a", "b"]
 * ```
 */
export function orderByDependency(needs: ReadonlyMap<string, readonly string[]>): string[] {
  const ordered: string[] = [];
  const placed = new Set<string>();

  while (placed.size < needs.size) {
    const ready = [...needs.keys()]
      .filter((name) => !placed.has(name))
      .filter((name) => needs.get(name)?.every((dep) => !needs.has(dep) || placed.has(dep)))
      .sort();

    if (ready.length === 0) {
      const stuck = [...needs.keys()].filter((name) => !placed.has(name));
      throw new Error(`Dependency cycle among: ${stuck.sort().join(", ")}`);
    }

    for (const name of ready) {
      placed.add(name);
      ordered.push(name);
    }
  }

  return ordered;
}

/** The internal dependency graph of the given package directories. */
export function dependencyGraph(dirs: readonly string[]): Map<string, readonly string[]> {
  const names = new Set(dirs.map((dir) => readPkg(dir).name));
  const needs = new Map<string, readonly string[]>();

  for (const dir of dirs) {
    const pkg = readPkg(dir);
    /* A peer is an ordering edge too: a consumer installing the adapter has
       to be able to resolve the core version it asks for, so core must be on
       the registry first even though npm will not install it for them. */
    const internal = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ];
    needs.set(
      pkg.name,
      [...new Set(internal.filter((dep) => dep.startsWith(SCOPE) && names.has(dep)))].sort(),
    );
  }

  return needs;
}

/** Package directories in the order they may safely be published. */
export function publishOrder(dirs: readonly string[]): string[] {
  const dirByName = new Map(dirs.map((dir) => [readPkg(dir).name, dir]));
  return orderByDependency(dependencyGraph(dirs)).map((name) => dirByName.get(name) as string);
}
