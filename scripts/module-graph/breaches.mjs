import { chainTo, reachedFrom } from "./reach.mjs";
import { packageOf, underLib } from "./resolve-import.mjs";
import { serverAreaOf } from "./server-area.mjs";

/**
 * @typedef {import("./resolve-import.mjs").Package & { lib: string, areas: string[], sides?: Sides }} SidedPackage
 *   A package of the workspace, with its `lib` folder, the areas of it only a server runs, and its
 *   `module-sides.json` when it has one
 * @typedef {{ pagePackages?: Record<string, string>, computedImports?: Record<string, string> }} Sides
 *   What a package's `module-sides.json` lets its page code do: the packages outside the workspace
 *   it may take, and its modules whose dynamic import names no module a bundler can tell, or
 *   modules by a pattern, each with why
 */

/**
 * What one entry a page imports breaches, through every module it reaches
 * as a page's bundler resolves them, a workspace package named by its name
 * among them:
 *
 *  - a module of an area of its package that only a server runs;
 *  - a built-in module of Node;
 *  - a package outside the workspace that the `pagePackages` of the
 *    importing module's package do not list;
 *  - a package of the workspace with no `module-sides.json` to say what a
 *    page may take of it;
 *  - a dynamic import, a `require()`, a `require.resolve`, an
 *    `import.meta.resolve`, a `require.ensure` or a
 *    `new URL(…, import.meta.url)` whose name no bundler can tell, or an
 *    `import.meta.glob` of a pattern or a context of a folder —
 *    `import.meta.webpackContext`, `require.context` — in a module its
 *    package's `computedImports` do not name;
 *  - an import that leads to nothing.
 *
 * Each breach names the way the entry reached it.
 *
 * @param {typeof import("typescript")} ts - The TypeScript compiler, whose scanner reads the imports
 * @param {string} label - The entry, as a page imports it: `@noverax/courier/client`
 * @param {string} file - The entry's module
 * @param {SidedPackage[]} packages - The workspace's packages
 * @returns {{ breaches: string[], reached: number, foreign: string[] }} The breaches, how many modules it reaches, and the packages outside the workspace it takes
 * @example
 * const { breaches } = entryBreaches(ts, "@noverax/courier/client", file, packages);
 */
export function entryBreaches(ts, label, file, packages) {
  const { parents, builtins, foreign, missing, computed } = reachedFrom(ts, file, packages);
  const home = packageOf(file, packages);
  const step = (path) => {
    const pkg = packageOf(path, packages);
    if (pkg === undefined) return path;
    return pkg === home ? underLib(pkg.lib, path) : `${pkg.name}:${underLib(pkg.lib, path)}`;
  };
  const way = (module) => chainTo(parents, module).map(step).join(" → ");
  const breaches = [];
  const unsided = new Map();
  for (const module of parents.keys()) {
    const pkg = packageOf(module, packages);
    if (pkg !== undefined && pkg.sides === undefined && !unsided.has(pkg.name)) {
      unsided.set(pkg.name, module);
    }
    const area = pkg && serverAreaOf(underLib(pkg.lib, module), pkg.areas);
    if (area !== undefined) {
      const of = pkg === home ? area : `${area} of ${pkg.name}`;
      breaches.push(`${label} reaches ${of}, which only a server runs: ${way(module)}`);
    }
  }
  for (const [name, module] of unsided) {
    breaches.push(
      `${label} reaches ${name}, which has no module-sides.json to say what a page may take of it: ${way(module)}`,
    );
  }
  for (const { name, importer } of builtins) {
    breaches.push(
      `${label} reaches ${name}, a built-in module of Node: ${way(importer)} → ${name}`,
    );
  }
  for (const { name, importer } of foreign) {
    const pkg = packageOf(importer, packages);
    if (pkg?.sides !== undefined && pkg.sides.pagePackages?.[name] === undefined)
      breaches.push(
        `${label} reaches ${name}, which ${pkg.name}'s module-sides.json lets no page take: ${way(importer)} → ${name}`,
      );
  }
  for (const { kind, line, pattern, module } of computed) {
    const pkg = packageOf(module, packages);
    if (pkg?.sides?.computedImports?.[underLib(pkg.lib, module)] !== undefined) continue;
    const names = pattern ? "names modules by a pattern" : "names no module a bundler can tell";
    breaches.push(
      `${label} reaches ${step(module)}, whose ${kind}() at line ${line} ${names}: ${way(module)}`,
    );
  }
  for (const { reason, importer } of missing) {
    breaches.push(`${label}: ${reason}, imported by ${step(importer)}`);
  }
  const taken = foreign.filter(
    ({ name, importer }) =>
      packageOf(importer, packages)?.sides?.pagePackages?.[name] !== undefined,
  );
  return {
    breaches,
    reached: parents.size,
    foreign: [...new Set(taken.map((each) => each.name))].sort(),
  };
}
