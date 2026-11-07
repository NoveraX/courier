import type { Targets } from "./import-resolution";

/** What Vite loads of a file a query names: its code — a worker's among them — its address alone, which code may load it by, or its text. */
export type QueryLoads = "code" | "address" | "text";

/* A query as Vite 8's plugins test it: a worker's or a shared worker's, a file's text, its address. */
const WORKER = /(?:\?|&)(?:worker|sharedworker)(?:&|$)/;
const TEXT = /(?:\?|&)raw(?:&|$)/;
const ADDRESS = /(?:\?|&)url(?:&|$)/;

/**
 * What Vite loads of a file by the query it is named with, as its own
 * plugins read one: `?worker` and `?sharedworker`, inlined or not, build
 * the module's code into a worker the file's side starts; `?url` gives
 * its address alone, which code may load it by, as a paint worklet is;
 * `?raw` gives its text, which nothing runs. Any other query — `?inline`
 * of a module among them, which Vite reads for an asset alone — leaves
 * the module's code to load.
 *
 * @param query - The query, from its `?`; none where there is none
 * @returns What Vite loads of the file
 * @example
 * ```ts
 * queryLoads("?worker&inline"); // "code"
 * ```
 */
export function queryLoads(query: string | undefined): QueryLoads {
  if (query === undefined || WORKER.test(query)) return "code";
  if (TEXT.test(query)) return "text";
  return ADDRESS.test(query) ? "address" : "code";
}

/**
 * A specifier without its query, as Vite resolves it, and what Vite
 * loads of the file by the query.
 *
 * @param specifier - The specifier, as written
 * @returns The path it names and what is loaded of it
 * @example
 * ```ts
 * withoutQuery("./workers/sync.ts?worker"); // { path: "./workers/sync.ts", loads: "code" }
 * ```
 */
export function withoutQuery(specifier: string): {
  readonly path: string;
  readonly loads: QueryLoads;
} {
  const at = specifier.indexOf("?");
  if (at <= 0) return { path: specifier, loads: "code" };
  return { path: specifier.slice(0, at), loads: queryLoads(specifier.slice(at)) };
}

/**
 * Where a specifier leads by what Vite loads of the file it names: all
 * it names, where the file's code loads; nothing, where its text alone
 * does; and where its address alone does, each file it names as one code
 * may load by that address.
 *
 * @param targets - Where the specifier without its query leads
 * @param loads - What Vite loads of the file by the query
 * @returns Where the specifier leads
 * @example
 * ```ts
 * byQuery(resolve(from, path), "address").loose; // ["src/paint/border.ts"]
 * ```
 */
export function byQuery(targets: Targets, loads: QueryLoads): Targets {
  if (loads === "code") return targets;
  const { files, page, server, loose, pageLoose, serverLoose } = targets;
  const certain = { files: [], page: [], server: [] };
  if (loads === "text")
    return {
      ...targets,
      ...certain,
      loose: [],
      pageLoose: [],
      serverLoose: [],
      packages: [],
      unread: [],
    };
  return {
    ...targets,
    ...certain,
    loose: [...files, ...loose],
    pageLoose: [...page, ...pageLoose],
    serverLoose: [...server, ...serverLoose],
  };
}
