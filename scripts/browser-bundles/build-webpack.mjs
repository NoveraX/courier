import { readFileSync } from "node:fs";
import { join } from "node:path";

import { slashed } from "./file-paths.mjs";

/**
 * What a page loads at start when webpack builds it for production: the
 * entry's initial chunks, minified as webpack minifies them, and the
 * modules they hold — and the modules of every chunk, a dynamic import's
 * among them, as the page may load any.
 *
 * `resolve.tsconfig` is off: webpack reads the `tsconfig.json` nearest a
 * module, and inside this repository a package's points back at its
 * sources — an application's installed packages have none.
 *
 * @param {typeof import("webpack")} webpack - webpack, as the repository installs it
 * @param {string} entry - The scenario's module
 * @param {string} out - Where the build is written
 * @param {readonly string[]} provided - The application's own libraries, left out
 * @returns {Promise<{ code: string, modules: string[], everyModule: string[] }>} The start's code, the files of its modules, and those of every chunk, each with forward slashes
 * @example
 * const { code } = await webpackStart(webpack, "/work/page.js", "/work/webpack", ["react"]);
 */
export async function webpackStart(webpack, entry, out, provided) {
  const compiler = webpack({
    mode: "production",
    context: join(entry, ".."),
    entry: { main: entry },
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
    devtool: false,
    performance: { hints: false },
  });
  const stats = await new Promise((resolve, reject) =>
    compiler.run((error, result) => (error ? reject(error) : resolve(result))),
  );
  await new Promise((resolve) => compiler.close(resolve));
  if (stats.hasErrors()) throw new Error(stats.toString("errors-only"));
  const json = stats.toJson({ entrypoints: true, chunks: true, modules: true });
  const initial = new Set(json.entrypoints.main.chunks);
  const code = json.entrypoints.main.assets.map((asset) =>
    readFileSync(join(out, asset.name), "utf8"),
  );
  const filesOf = (list) =>
    list
      .flatMap((module) => [module, ...(module.modules ?? [])])
      .map((module) => module.nameForCondition)
      .filter((name) => typeof name === "string")
      .map(slashed);
  const all = json.modules ?? [];
  const modules = filesOf(
    all.filter((module) => module.chunks.some((chunk) => initial.has(chunk))),
  );
  return { code: code.join(""), modules, everyModule: filesOf(all) };
}
