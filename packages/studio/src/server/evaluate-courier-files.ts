import { createRequire } from "node:module";
import { sep } from "node:path";
import { createLogger } from "@noverax/courier";
import type { TransformCache } from "@noverax/courier-studio-core/config";
import { type CourierModuleCache, loadCourierEntry } from "./load-courier-entry";

const log = createLogger("Studio");

/** Node's require cache, which a CommonJS entry is required into and JSON is read through. */
const NODE_REQUIRE_CACHE = createRequire(import.meta.url).cache;

const IN_NODE_MODULES = `${sep}node_modules${sep}`;

/** What loading the project's config, and its mocks file if any, produced. */
export interface EvaluatedCourierFiles {
  /** The config's default export. */
  config: unknown;
  /**
   * The mocks file's module namespace, or the `module.exports` of a CommonJS
   * one that was transpiled; absent when there is no mocks file or it did not load.
   */
  mocksNamespace?: unknown;
  /** Why the mocks file did not load, while the config did. */
  mocksError: unknown | null;
}

/**
 * Load `courier.config.*`, then `courier.mocks.*`, as one module graph.
 *
 * One graph, because the loader keeps no module cache from one load to the
 * next: loading the files apart would evaluate every source module twice on
 * every reload — seconds for a large generated client — and hand the mocks
 * other source objects than the config's. Both files are evaluated over one
 * module cache, the config first. Every module the loader evaluates is
 * registered there, the config included, under the path its importers
 * resolve it to, so the mocks file's imports of the config, or of anything
 * the config's evaluation left there, are handed the very same objects and
 * evaluate nothing again. How each file is evaluated, by its format, is
 * {@link loadCourierEntry}'s to say.
 *
 * A module Node runs is shared only as Node shares it, through its own
 * require cache. A CommonJS config is in that cache while the load runs, so
 * a CommonJS mocks file's require of it is handed the config Studio loaded.
 * A JavaScript mocks file the config imports is Node's copy to the config,
 * and runs again for Studio. Any other module a CommonJS config or mocks
 * file requires is Node's own copy: a CommonJS mocks file that requires a
 * TypeScript config Node can run gets Node's evaluation of it, not the
 * config Studio loaded, and a TypeScript module both files use is two
 * modules when the CommonJS one requires it. Node's copy stays as Node first
 * ran it while the other is evaluated afresh, so after an edit the two
 * differ.
 *
 * A config that does not load fails the whole load, and the mocks file is
 * then not evaluated. A mocks file that does not load leaves the config as it
 * loaded and says why: a broken mocks file takes neither the sources down
 * nor a second evaluation of the config. A module the config's evaluation
 * did not finish is dropped from the cache before the mocks file is
 * evaluated, so the mocks file's import of it evaluates it again. For a
 * module that threw while the config caught the failure, that import fails
 * too, as it would under Node, rather than taking its partial exports. A
 * module the config started without awaiting it, still at its top-level
 * `await`, cannot be told apart from one that threw: it runs a second time
 * for the mocks file, which gets that second module, not the config's.
 *
 * The config's default export is settled when it is a promise, as the
 * runtime's loader settles it.
 *
 * Once the load is over, Node's require cache is put back as the load found
 * it for what the load itself set there. The config and the mocks file get
 * back the module the cache held for them before — a process that required
 * the config itself keeps the module it got — or none. The loader reads a
 * JSON module through that cache too, which would hand it back as first read
 * for the life of the process, so every JSON module that entered the cache
 * while the load ran, outside `node_modules`, is dropped again, and the next
 * load reads an edited one afresh. One that was there before the load is
 * left as it was: someone else required it. Node's require cache is one per
 * process, so loads that overlap in time see each other's modules there: a
 * CommonJS mocks file can be handed the config another load required, and
 * what one load puts back can be the module another one left.
 *
 * Both paths must be symlink-resolved: imports resolve to real paths, so a
 * config evaluated by a link would be evaluated again for the mocks file
 * that imports it, and a mocks file evaluated by a link would resolve its
 * relative imports from the link's directory instead of its own.
 *
 * @param configFile - The config's absolute, symlink-resolved path
 * @param mocksFile - The mocks file's absolute, symlink-resolved path, or
 *   `null` when there is none to load
 * @param transformCache - Where each module's transform is reused while its
 *   bytes are unchanged
 * @returns The config's export, the mocks namespace, and a mocks-only failure
 * @throws What the loader reported when the config itself does not load
 * @example
 * ```ts
 * const { config, mocksNamespace, mocksError } = await evaluateCourierFiles(
 *   realpathSync(join(root, "courier.config.ts")),
 *   realpathSync(join(root, "courier.mocks.ts")),
 *   studioTransformCache(root),
 * );
 * ```
 */
export async function evaluateCourierFiles(
  configFile: string,
  mocksFile: string | null,
  transformCache: TransformCache,
): Promise<EvaluatedCourierFiles> {
  const heldBefore = new Set(Object.keys(NODE_REQUIRE_CACHE));
  const entriesBefore = heldEntries([configFile, mocksFile]);
  try {
    return await evaluateBoth(configFile, mocksFile, transformCache);
  } finally {
    putBack(entriesBefore);
    forgetJsonReadSince(heldBefore);
  }
}

async function evaluateBoth(
  configFile: string,
  mocksFile: string | null,
  transformCache: TransformCache,
): Promise<EvaluatedCourierFiles> {
  const cache: CourierModuleCache = {};
  const config = await defaultExport(await loadCourierEntry(configFile, cache, transformCache));
  forgetUnfinished(cache);
  if (mocksFile === null) return { config, mocksError: null };
  try {
    const mocksNamespace = await loadCourierEntry(mocksFile, cache, transformCache);
    return { config, mocksNamespace, mocksError: null };
  } catch (mocksError) {
    log.debug(`${mocksFile} did not load; the config loads without it`, mocksError);
    return { config, mocksError };
  }
}

/* What the runtime's loader, `import(file, { default: true })`, hands back:
   the namespace's default, or the namespace itself when that is nullish, a
   promise among them settled. */
async function defaultExport(namespace: unknown): Promise<unknown> {
  if (!isObjectLike(namespace)) return namespace;
  const value: unknown = Reflect.get(namespace, "default");
  return value ?? namespace;
}

/* jiti registers a module before evaluating it and marks it loaded only once
   it has run to its end; one that threw and one still running look alike. */
function forgetUnfinished(cache: CourierModuleCache): void {
  for (const [key, module] of Object.entries(cache)) {
    if (!module.loaded) Reflect.deleteProperty(cache, key);
  }
}

/* What Node's require cache holds for each file, to put back after the load. */
function heldEntries(files: ReadonlyArray<string | null>): Map<string, NodeModule | undefined> {
  const held = new Map<string, NodeModule | undefined>();
  for (const file of files) if (file !== null) held.set(file, NODE_REQUIRE_CACHE[file]);
  return held;
}

function putBack(held: ReadonlyMap<string, NodeModule | undefined>): void {
  for (const [file, module] of held) {
    if (module === undefined) Reflect.deleteProperty(NODE_REQUIRE_CACHE, file);
    else NODE_REQUIRE_CACHE[file] = module;
  }
}

function forgetJsonReadSince(heldBefore: ReadonlySet<string>): void {
  for (const file of Object.keys(NODE_REQUIRE_CACHE)) {
    if (!file.endsWith(".json") || heldBefore.has(file) || file.includes(IN_NODE_MODULES)) continue;
    Reflect.deleteProperty(NODE_REQUIRE_CACHE, file);
  }
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
