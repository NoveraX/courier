/**
 * Build one of the enterprise project's entry points into a single module
 * inside the project, as its own build would: its code bundled, Courier's
 * packages and zod imported from the project's `node_modules`.
 */

import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);

/**
 * Bundle an entry of the project.
 *
 * @param {string} dir - The project's folder
 * @param {string} entry - The entry, from the project's folder: `src/courier/callers.ts`
 * @param {string} name - The bundle's name: `callers`
 * @returns {Promise<string>} Where the bundle is
 * @example
 * ```js
 * const bundle = await bundleEntry(dir, "src/courier/callers.ts", "callers");
 * ```
 */
export async function bundleEntry(dir, entry, name) {
  const { build } = require("esbuild");
  const outfile = join(dir, ".scale", `${name}.mjs`);
  await build({
    entryPoints: [join(dir, entry)],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    tsconfig: join(dir, "tsconfig.json"),
    external: ["@noverax/*", "zod"],
    logLevel: "error",
  });
  return outfile;
}
