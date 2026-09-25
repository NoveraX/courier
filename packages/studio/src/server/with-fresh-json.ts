import { createRequire } from "node:module";
import { sep } from "node:path";

/** Node's require cache, which the loader reads a JSON module through. */
const NODE_REQUIRE_CACHE = createRequire(import.meta.url).cache;

const IN_NODE_MODULES = `${sep}node_modules${sep}`;

/* What Node's require cache held when each load still running started,
   oldest first. A load Studio gave up on stays here for as long as it runs. */
const running = new Set<ReadonlySet<string>>();

/**
 * Run a load of the project so that each JSON module it reads is read from
 * disk, not handed back as some earlier load first read it.
 *
 * The loader reads a JSON module through Node's require cache, which would
 * keep it as first read for the life of the process. So every JSON module
 * that entered the cache while the load ran, outside `node_modules`, is
 * dropped again once it ends, however it ends. One that was there before
 * the load is left as it was: someone else required it.
 *
 * A load given up on may never end, and would then keep what it read in the
 * cache for good. So a load also starts by dropping every JSON module that
 * entered the cache since the oldest load still running started: those were
 * read by loads, not by whoever required a module before any of them ran.
 * Node's require cache is one per process, so a module the process itself
 * requires while a load runs is dropped with them, and read again by its
 * next `require`.
 *
 * @param load - The load, started once the cache is ready for it
 * @returns What the load resolved with
 * @throws What the load threw
 *
 * @example
 * ```ts
 * const loaded = await withFreshJson(() => evaluateBoth(configFile, mocksFile, transformCache));
 * ```
 */
export async function withFreshJson<TValue>(load: () => Promise<TValue>): Promise<TValue> {
  const [oldest] = running;
  if (oldest !== undefined) forgetJsonReadSince(oldest);
  const heldBefore: ReadonlySet<string> = new Set(Object.keys(NODE_REQUIRE_CACHE));
  running.add(heldBefore);
  try {
    return await load();
  } finally {
    running.delete(heldBefore);
    forgetJsonReadSince(heldBefore);
  }
}

function forgetJsonReadSince(heldBefore: ReadonlySet<string>): void {
  for (const file of Object.keys(NODE_REQUIRE_CACHE)) {
    if (!file.endsWith(".json") || heldBefore.has(file) || file.includes(IN_NODE_MODULES)) continue;
    Reflect.deleteProperty(NODE_REQUIRE_CACHE, file);
  }
}
