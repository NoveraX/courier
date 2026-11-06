/// <reference types="node" />
/**
 * Check that no entry a page imports reaches a module only a server runs.
 *
 * Each workspace package with a `module-sides.json` puts every entry it
 * exports on a side — what a page imports, what a server does, or both —
 * and names the areas of its build only a server runs, the packages
 * outside the workspace its page code may take, and the modules whose
 * dynamic import names no module a bundler can tell, or modules by a
 * pattern, each with why. From each page entry, every module it reaches
 * is followed, as a page's bundler resolves the published `lib/` — static
 * imports, re-exports, dynamic imports, what a bundler reads as an import
 * though none names it (`import.meta.glob` of a path,
 * `new URL(path, import.meta.url)`, `require.resolve` and
 * `import.meta.resolve` of one, `require.ensure`), a package's own
 * `#courier-server/…` through the stand-in its `browser` condition picks,
 * and a package of the workspace named by its name, the core's own name
 * among them, through the `exports` a page's conditions pick — before any
 * bundler drops what is unused: what a page's bundle holds then depends on
 * no bundler. A breach is:
 *
 *  - a module of a server's area reached, with the way it was reached;
 *  - a built-in module of Node reached, or a package outside the workspace
 *    that the importing package does not let a page take — any other one,
 *    so a server's package is caught whatever it is;
 *  - a package of the workspace reached that has no `module-sides.json`;
 *  - a dynamic import, a `require()`, a `require.resolve`, an
 *    `import.meta.resolve`, a `require.ensure` or a
 *    `new URL(…, import.meta.url)` whose name no bundler can tell, or an
 *    `import.meta.glob` of a pattern or a context of a folder —
 *    `import.meta.webpackContext`, `require.context` — in a module its
 *    package does not name for one;
 *  - an import that leads to nothing, an entry on no side, a side naming
 *    what the build has none of, or a package a page may take that the
 *    package does not depend on, which would leave the check reading less
 *    than it says.
 *
 * The packages each entry takes are listed beside it. Requires a build
 * first. Exits 1 with each breach.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

import { entryBreaches } from "./module-graph/breaches.mjs";
import { entrySideBreaches } from "./module-graph/entry-sides.mjs";
import { resolveImport } from "./module-graph/resolve-import.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = join(ROOT, "packages");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/* Every package of the workspace, with the sides its `module-sides.json` names, if it has one. */
function workspacePackages() {
  return readdirSync(PACKAGES).flatMap((dir) => {
    const root = join(PACKAGES, dir);
    if (!existsSync(join(root, "package.json"))) return [];
    const manifest = readJson(join(root, "package.json"));
    const { name, exports, imports } = manifest;
    const sidesFile = join(root, "module-sides.json");
    const sides = existsSync(sidesFile) ? readJson(sidesFile) : undefined;
    const areas = Object.keys(sides?.serverAreas ?? {});
    const depends = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
    const lib = join(root, "lib");
    return [{ name, root, exports, imports: imports ?? {}, lib, areas, sides, depends }];
  });
}

/* A package a page may take that the package does not depend on: a name written wrong lets nothing. */
function strayPagePackages(pkg) {
  return Object.keys(pkg.sides?.pagePackages ?? {})
    .filter((name) => !pkg.depends.includes(name))
    .map(
      (name) =>
        `${pkg.name}'s module-sides.json lets a page take ${name}, which it does not depend on`,
    );
}

/* An area the build has none of would match nothing, and pass whatever reached it. */
function missingAreas(pkg) {
  return pkg.areas
    .filter((area) => {
      const path = join(pkg.lib, area);
      return !existsSync(path) || statSync(path).isDirectory() !== area.endsWith("/");
    })
    .map((area) => `${pkg.name}'s module-sides.json names ${area}, which the build has none of`);
}

function main() {
  const ts = createRequire(join(ROOT, "package.json"))("typescript");
  const packages = workspacePackages();
  const breaches = [...packages.flatMap(missingAreas), ...packages.flatMap(strayPagePackages)];
  for (const pkg of packages.filter((each) => each.sides !== undefined)) {
    breaches.push(...entrySideBreaches(pkg.name, pkg.exports, pkg.sides));
  }
  for (const pkg of packages) {
    for (const entry of Object.keys(pkg.sides?.pageEntries ?? {})) {
      const label = entry === "." ? pkg.name : `${pkg.name}${entry.slice(1)}`;
      const found = resolveImport(label, join(pkg.root, "package.json"), packages);
      if (found.kind !== "module") {
        breaches.push(
          `${pkg.name}'s module-sides.json names ${entry}, which it does not export to a page`,
        );
        continue;
      }
      const result = entryBreaches(ts, label, found.path, packages);
      breaches.push(...result.breaches);
      const takes =
        result.foreign.length > 0 ? `, and the packages ${result.foreign.join(", ")}` : "";
      console.log(`check-module-graph: ${label} reaches ${result.reached} modules${takes}`);
    }
  }
  if (breaches.length === 0) return;
  console.error(`\ncheck-module-graph: ${breaches.length} breach(es)\n${breaches.join("\n")}`);
  process.exit(1);
}

if (argv[1] && resolve(argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
