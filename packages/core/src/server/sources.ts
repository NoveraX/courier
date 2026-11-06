/**
 * Global sources registry — the canonical in-process record of every
 * API source the runtime currently knows about.
 *
 * # Why this lives in core
 *
 * Framework adapter handlers (`courierHandler()`, `apiRoute()`, …) read
 * sources at request time via `getSources()` instead of taking an
 * explicit `sources` argument. Core ships with the registry so the
 * adapter packages don't need to depend on `@noverax/courier-studio-core`
 * in production just to read a dictionary.
 *
 * # Who writes to it
 *
 * `attachRuntime()` from `@noverax/courier-studio-core/runtime` populates
 * the registry on startup from `courier.config.ts.sources`. Outside
 * production it also listens on `studioHooks.onSourceDefined`, and registers
 * the config's sources again whenever a hot-reloaded module runs
 * `defineApi()`, so the registry follows the application's edits without
 * user-code intervention.
 *
 * # Storage
 *
 * Pinned to `globalThis` via `Symbol.for` so it survives bundler module
 * duplication (Turbopack / webpack chunk boundaries) — the same pattern
 * as `studioHooks` and `app-origin`.
 */

import { getSourceName, setSourceName } from "../define/api";
import { stampSourceKeys } from "../define/stamp-source-keys";
import type { Sources } from "../define/types";
import { ConfigurationError } from "../errors/configuration-error";
import { assertServerOptions } from "./assert-server-options";
import { describe } from "./plain-data";
import { provideInProcessProxy } from "./provide-in-process-proxy";
import { provideServerCapabilities } from "./provide-server-capabilities";

const SOURCES_KEY = Symbol.for("courier.sources");

type SourcesListener = (sources: Sources) => void;

interface SourcesRegistry {
  current: Sources | undefined;
  generation: number;
  listeners: Set<SourcesListener>;
}

const g = globalThis as Record<symbol, unknown>;

function getRegistry(): SourcesRegistry {
  if (!g[SOURCES_KEY]) {
    g[SOURCES_KEY] = { current: undefined, generation: 0, listeners: new Set() };
  }
  return g[SOURCES_KEY] as SourcesRegistry;
}

/* An object literal or a module namespace, from any realm: a Map, a Promise
   or a class instance would be read as a registry holding no sources. */
function isPlainRecord(value: unknown): value is Sources {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/* The key each API was first taken up under, the entry point that took it up there, and the name
   its author left it before any key was stamped. */
interface TakenUp {
  readonly key: string;
  readonly by: string;
  readonly named: string | undefined;
}

let takenUp = new WeakMap<object, TakenUp>();

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

/**
 * Check that `sources` is a dictionary of named sources, and the options
 * only a server reads of each — `session`, `forward`, the header lists —
 * with `assertServerOptions`, leaving each source's name as it is: what
 * an entry point needs whose calls name the key they go by.
 *
 * @param sources - The sources by key, as the caller handed them over
 * @param callee - The function they were handed to, named in the error
 * @param usage - How that function takes them, shown in the error
 * @throws ConfigurationError `SOURCES_NOT_A_RECORD` for anything but an object
 * @throws ConfigurationError what `assertServerOptions` refuses a source's options with
 *
 * @example
 * ```ts
 * checkSources({ api }, "createAction", 'createAction({ api }, "api")');
 * ```
 */
export function checkSources(sources: Sources, callee: string, usage: string): void {
  /* Sources are read much later, at request time. Accepting a wrong value
     here reports the mistake as a missing endpoint somewhere else entirely —
     or, for null, as a bare TypeError thrown from inside the library. */
  if (!isPlainRecord(sources)) {
    throw new ConfigurationError(
      "SOURCES_NOT_A_RECORD",
      [
        `[courier] ${callee}() expects an object of named sources, received ${describe(sources)}.`,
        "",
        "Each key is the name the proxy addresses the source by:",
        `  ${usage}`,
      ].join("\n"),
    );
  }
  /* The options only a server reads are checked as a server takes the sources up. */
  for (const [key, source] of Object.entries(sources)) assertServerOptions(source, key);
}

/**
 * Check `sources` as `checkSources` does, and make each key its source's
 * name, before anything serves them: the server resolves a call by the
 * key, and `createCaller(api)` emits the same name.
 *
 * An API keeps the key the first entry point took it up under, and
 * another key is refused, naming that entry point and its key. Only
 * `registerSources`, which replaces the whole dictionary, may move an API
 * it took up itself to another key, as a hot reload that renamed one
 * does. A key no entry point took, a name the author gave `defineApi`, is
 * the author's, and `stampSourceKeys` refuses a key that contradicts it.
 *
 * @param sources - The sources by key, as the caller handed them over
 * @param callee - The function they were handed to, named in the error
 * @param usage - How that function takes them, shown in the error
 * @throws ConfigurationError `SOURCES_NOT_A_RECORD` for anything but an object
 * @throws ConfigurationError `SOURCE_KEY_MISMATCH` when a key contradicts a name or another key
 * @throws ConfigurationError what `assertServerOptions` refuses a source's options with
 *
 * @example
 * ```ts
 * prepareSources({ api, billing }, "registerSources", "registerSources({ api, billing })");
 * ```
 */
export function prepareSources(sources: Sources, callee: string, usage: string): void {
  checkSources(sources, callee, usage);
  const moved: [object, TakenUp][] = [];
  for (const [key, source] of Object.entries(sources)) {
    const first = isObject(source) ? takenUp.get(source) : undefined;
    if (first === undefined || first.key === key) continue;
    if (callee === "registerSources" && first.by === callee) {
      moved.push([source, first]);
      continue;
    }
    throw new ConfigurationError(
      "SOURCE_KEY_MISMATCH",
      [
        `[courier] ${callee} takes up as "${key}" an API that ${first.by} took up as "${first.key}" first.`,
        "",
        "The proxy and the routes module address a source by one key, so every entry point takes an",
        `API up under the same one: use "${first.key}" in ${callee} too, or give it an API of its own.`,
      ].join("\n"),
    );
  }
  /* A key it moves to is held to the name the author left the API, not the one last stamped. */
  for (const [source, first] of moved) {
    if (first.named !== undefined) setSourceName(source, first.named);
  }
  const named = new Map<object, string | undefined>();
  for (const source of Object.values(sources)) {
    if (isObject(source)) named.set(source, getSourceName(source));
  }
  stampSourceKeys(sources);
  for (const [key, source] of Object.entries(sources)) {
    if (!isObject(source)) continue;
    const first = takenUp.get(source);
    if (first === undefined) takenUp.set(source, { key, by: callee, named: named.get(source) });
    else if (first.key !== key) takenUp.set(source, { ...first, key });
  }
}

/**
 * Replace the current sources and notify every listener.
 *
 * The sources are checked and their keys stamped first — see
 * `prepareSources`. Call this exactly once per process unless you intend
 * to replace the whole dictionary (HMR does this).
 */
export function registerSources(sources: Sources): void {
  prepareSources(sources, "registerSources", "registerSources({ api, billing })");
  /* Sources are registered on a server: its calls take the user's session
     from the request being served, and its own proxy callers reach the
     proxy that serves them in process, from now on. */
  provideServerCapabilities();
  provideInProcessProxy();

  const registry = getRegistry();
  registry.current = sources;
  registry.generation++;
  for (const fn of registry.listeners) fn(sources);
}

/**
 * Read the currently registered sources. Returns `undefined` before
 * the first `registerSources` call — adapter handlers must throw a
 * clear initialization error in that case rather than silently
 * dropping the request.
 */
export function getSources(): Sources | undefined {
  return getRegistry().current;
}

/** Subscribe to source changes. Returns unsubscribe function. */
export function onSourcesChange(fn: SourcesListener): () => void {
  const registry = getRegistry();
  registry.listeners.add(fn);
  return () => registry.listeners.delete(fn);
}

/** Monotonic generation counter for cheap dirty-checks. */
export function getSourcesGeneration(): number {
  return getRegistry().generation;
}

/**
 * Reset the global registry to its uninitialized state. Only used by test
 * harnesses to isolate `getSources()`/`requireSources()` semantics between
 * test cases — production code should never need to clear the registry.
 */
export function _resetSourcesForTests(): void {
  const registry = getRegistry();
  registry.current = undefined;
  registry.generation = 0;
  registry.listeners.clear();
  takenUp = new WeakMap();
}
