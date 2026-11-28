import { join } from "node:path";

import { slashed } from "./file-paths.mjs";

/**
 * The exports each module a page loads at start keeps, when webpack builds
 * the page for production with an application's other pages in one
 * compilation and one runtime, as Next.js builds an app's pages. webpack
 * keeps in a module every export any page of the compilation takes, a
 * dynamic import's chunk among them: a module one page shares with the
 * others carries what only they take. Built with the page alone, the same
 * modules keep what that page takes.
 *
 * Modules are not joined, so that each says what it keeps; `resolve.tsconfig`
 * is off, as `webpackStart` has it.
 *
 * @param {typeof import("webpack")} webpack - webpack, as the repository installs it
 * @param {Record<string, string>} pages - Each page's module, by the page's name
 * @param {string} page - The name of the page whose modules are read
 * @param {string} out - Where the build is written
 * @param {readonly string[]} provided - The application's own libraries, left out
 * @returns {Promise<Map<string, readonly string[] | true>>} By the file of each module the page loads at start, with forward slashes, the exports it keeps: `true` for every one
 * @example
 * const kept = await webpackKeptExports(webpack, { definitions: "/work/definitions.js", caller: "/work/caller.js" }, "definitions", "/work/kept", []);
 */
export async function webpackKeptExports(webpack, pages, page, out, provided) {
  const compiler = webpack({
    mode: "production",
    context: join(out, ".."),
    entry: pages,
    target: ["web", "es2022"],
    output: {
      path: out,
      filename: "[name].js",
      chunkFilename: "[name].[contenthash].js",
      module: true,
    },
    experiments: { outputModule: true },
    externals: Object.fromEntries(provided.map((name) => [name, `module ${name}`])),
    externalsType: "module",
    resolve: { conditionNames: ["browser", "import", "module", "default"], tsconfig: false },
    optimization: { runtimeChunk: "single", concatenateModules: false },
    devtool: false,
    performance: { hints: false },
  });
  const stats = await new Promise((resolve, reject) =>
    compiler.run((error, result) => (error ? reject(error) : resolve(result))),
  );
  await new Promise((resolve) => compiler.close(resolve));
  if (stats.hasErrors()) throw new Error(stats.toString("errors-only"));
  const json = stats.toJson({ entrypoints: true, chunks: true, modules: true, usedExports: true });
  const initial = new Set(json.entrypoints[page].chunks);
  const kept = new Map();
  for (const module of json.modules ?? []) {
    if (typeof module.nameForCondition !== "string") continue;
    if (!module.chunks.some((chunk) => initial.has(chunk))) continue;
    const used = module.usedExports;
    kept.set(
      slashed(module.nameForCondition),
      used === true ? true : Array.isArray(used) ? used : [],
    );
  }
  return kept;
}

/**
 * What a page's modules keep beside an application's other pages and not
 * with the page alone: the exports a module keeps past its own, and each
 * module the page loads only beside them, which such an export brings.
 *
 * @param {ReadonlyMap<string, readonly string[] | true>} alone - What each module keeps, the page built alone
 * @param {ReadonlyMap<string, readonly string[] | true>} beside - What each keeps, the page built beside the others
 * @returns {{ module: string, exports: readonly string[] | true, loadedAlone: boolean }[]} Each module that keeps more, with what it keeps past its own: `true` for every export
 * @example
 * keptBeyond(new Map([["a.js", ["x"]]]), new Map([["a.js", ["x", "y"]], ["b.js", ["z"]]]));
 * // [{ module: "a.js", exports: ["y"], loadedAlone: true }, { module: "b.js", exports: ["z"], loadedAlone: false }]
 */
export function keptBeyond(alone, beside) {
  const beyond = [];
  for (const [module, kept] of beside) {
    const own = alone.get(module);
    if (own === undefined) {
      beyond.push({ module, exports: kept, loadedAlone: false });
      continue;
    }
    if (own === true) continue;
    const more = kept === true ? true : kept.filter((name) => !own.includes(name));
    if (more === true || more.length > 0) beyond.push({ module, exports: more, loadedAlone: true });
  }
  return beyond;
}
