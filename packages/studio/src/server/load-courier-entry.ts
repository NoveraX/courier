import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createLogger } from "@noverax/courier";
import type { TransformCache } from "@noverax/courier-studio-core/config";
import { createConfigJiti } from "@noverax/courier-studio-core/config";
import { isCommonJsEntry } from "./is-commonjs-entry";

type ConfigJiti = Awaited<ReturnType<typeof createConfigJiti>>;
type EvalModuleOptions = NonNullable<Parameters<ConfigJiti["evalModule"]>[1]>;

/** The modules one load has evaluated, each under the path its importers resolve it to. */
export type CourierModuleCache = NonNullable<EvalModuleOptions["cache"]>;

const log = createLogger("Studio");

/**
 * Evaluate `courier.config.*` or `courier.mocks.*` afresh into a module cache
 * one load shares, and return its module namespace.
 *
 * The file resolves its imports, path aliases included, from its own
 * directory, as the runtime and a mock server's worker resolve them when they
 * load it alone. It is registered under the key jiti gives the path when a
 * module imports it, so an import of it that the loader transpiles, from the
 * other file, is handed this very module. A file the load has already
 * evaluated into the cache — a TypeScript mocks file the config imports, say —
 * is handed back as it is, not evaluated again.
 *
 * A file the runtime's loader hands to Node as CommonJS (see
 * {@link isCommonJsEntry}) is required by Node first, as the runtime's loader
 * first hands it to Node: in sloppy mode, with its top-level `this` its
 * exports, a top-level `return` allowed, and its `module.exports` its
 * default. Its entry in Node's require cache is dropped first, so it runs
 * afresh on every load. The module Node then caches for it is registered in
 * the load's cache too, so the other file's require of it, as its import, is
 * handed this very module. Node's cache keeps that module until the caller
 * puts back what it held for the file before, once the load is over; see
 * `evaluateCourierFiles`. When Node cannot run the file — ES module syntax,
 * a top-level `await`, a require Node cannot resolve, such as an
 * extensionless or aliased TypeScript path, or anything else it throws — it
 * is transpiled instead, as the runtime's loader then transpiles it, and its
 * namespace is what the transpiled module exports.
 *
 * Every other file is transpiled, as TypeScript is. For an `.mjs` file, or a
 * `.js` one in a `"type": "module"` package, which Node would import
 * natively, that differs from Node: CommonJS's `require`, `module`,
 * `exports`, `__filename` and `__dirname` are in scope, and so is an
 * `arguments` object; and a default import of a CommonJS module that marks
 * itself `__esModule` hands its `default` rather than its whole
 * `module.exports`.
 *
 * A transpiled file's imports are transpiled and evaluated afresh too, save
 * those the loader hands to Node — `.mjs`, `.cjs`, a `.js` one in a
 * `"type": "module"` package, or a CommonJS `.js` one — which stay as Node
 * first ran them until the process restarts. So does every module but JSON
 * that a file Node runs requires, TypeScript and ES modules included: Node
 * keeps them, and one that requires the file back keeps the exports the
 * file's first run gave it. The dependency watcher does not follow
 * `require`, so an edit to a module that is only required does not reload
 * either. A JSON module is read through Node's require cache, which keeps it
 * as first read until it is dropped from there, as `evaluateCourierFiles`
 * drops it after every load.
 *
 * @param file - The file's absolute, symlink-resolved path
 * @param cache - The modules the load has evaluated so far
 * @param transformCache - Where each module's transform is reused while its
 *   bytes are unchanged
 * @returns The file's module namespace
 * @throws What evaluating the file, or a module it imports, threw
 * @example
 * ```ts
 * const cache: CourierModuleCache = {};
 * const namespace = await loadCourierEntry(configFile, cache, transformCache);
 * ```
 */
export async function loadCourierEntry(
  file: string,
  cache: CourierModuleCache,
  transformCache: TransformCache,
): Promise<unknown> {
  const jiti = await createConfigJiti(file, { transformCache });
  const key = jiti.resolve(file);
  const evaluated = cache[key];
  if (evaluated?.loaded === true) return evaluated.exports;
  const source = readFileSync(file, "utf8");
  const required = isCommonJsEntry(file, source) ? requireAfresh(file, key, cache) : null;
  if (required !== null) return required;
  await jiti.evalModule(source, { filename: key, async: true, cache, forceTranspile: true });
  const exports: unknown = cache[key]?.exports;
  return exports;
}

/* Node keeps a CommonJS module in its require cache under its path, and hands
   it back to every later require; dropping the entry runs the file again. The
   module is registered in the load's cache too, where a transpiled module's
   import of the file looks before it asks Node, whose own import would hand
   back the first run of it for good. A file Node cannot run is left to the
   loader's transpiler, as the runtime's loader leaves it; Node drops the
   module of a file that threw. */
function requireAfresh(
  file: string,
  key: string,
  cache: CourierModuleCache,
): { default: unknown } | null {
  const require = createRequire(file);
  Reflect.deleteProperty(require.cache, file);
  let exports: unknown;
  try {
    exports = require(file);
  } catch (error) {
    log.debug(`${file} did not run as CommonJS; it is transpiled instead`, error);
    return null;
  }
  const module = require.cache[file];
  if (module !== undefined && isCachedModule(module)) cache[key] = module;
  return { default: exports };
}

/* jiti reads a cached module's `exports`, and the load its `loaded`; Node's
   module record carries both, though Node's types give its `require` another
   shape than jiti's. */
function isCachedModule(module: NodeModule): module is NodeModule & CourierModuleCache[string] {
  return "exports" in module && "loaded" in module;
}
