import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { ViteDevServer } from "vite";

import { isRecord } from "../util/is-record";
import { ROUTES_MODULE_ID } from "../util/routes-module-id";
import type { RoutesPluginState } from "./routes-plugin-state";
import { watchOnce } from "./watch-once";

/** Where the config may be, and what to do when one appears there or goes. */
export interface ConfigWatch {
  /** Every path a config is looked for at, there or not. */
  readonly candidates: readonly string[];
  /** Called when a config appears at one of them or goes, before the routes are read again. */
  onChange(): void;
}

/* What the watcher reports of a path that appears or goes; a change of a watched file Vite reports itself. */
const PATH_EVENTS = ["add", "unlink", "addDir", "unlinkDir"] as const;

/**
 * Load the routes module again when a path the routes depend on appears or
 * goes, which no change of a watched file reports: a config saved where one
 * is looked for, inside Vite's root or above it, or the config removed; an
 * env file or a module made where the latest reading looked for one; an
 * entry added to or removed from a folder it listed.
 *
 * Vite watches with chokidar 3, which reads a folder it was handed missing
 * files in no more than once a second, and then for the first of them
 * alone: a config saved there under another of its names was never
 * reported. Each raw event of a folder a config may be in looks at every
 * place there a config is looked for, and a config that appears or goes is
 * told once, however many events report it.
 *
 * @param server - A dev server the plugin serves
 * @param state - What the plugin knows: the paths the latest reading followed
 * @param config - Where the config may be, and what to do when it moves
 * @example
 * ```ts
 * configureServer(server) {
 *   watchRoutesInputs(server, state, { candidates: configCandidates(root), onChange });
 * }
 * ```
 */
export function watchRoutesInputs(
  server: ViteDevServer,
  state: RoutesPluginState,
  config: ConfigWatch,
): void {
  const candidates = new Set(config.candidates);
  watchOnce(server, candidates);
  /* Whether a config is at each place one is looked for, as last told. */
  const there = new Map([...candidates].map((path) => [path, existsSync(path)]));
  const onPath = (path: string): void => {
    const isConfig = candidates.has(path);
    if (!isConfig && !state.followed.has(path) && !state.listed.has(dirname(path))) return;
    if (isConfig) {
      const now = existsSync(path);
      if (there.get(path) === now) return;
      there.set(path, now);
      config.onChange();
    }
    reloadRoutes(server);
  };
  for (const event of PATH_EVENTS) server.watcher.on(event, onPath);
  const folders = new Set([...candidates].map((path) => dirname(path)));
  server.watcher.on("raw", (_event: string, path: string, details: unknown) => {
    const folder = eventFolder(path, details);
    if (folder === undefined || !folders.has(folder)) return;
    for (const candidate of candidates) if (dirname(candidate) === folder) onPath(candidate);
  });
}

/* The folder a raw event is of, as the system names it: the one a watcher of it names
   beside the entry it reports, or the path a poll of it gives. */
function eventFolder(path: string, details: unknown): string | undefined {
  const watched = isRecord(details) ? details.watchedPath : undefined;
  const folder = typeof watched === "string" ? watched : path;
  return isAbsolute(folder) ? resolve(folder) : undefined;
}

/* Forget the routes module in every graph, and reload the page that took it. */
function reloadRoutes(server: ViteDevServer): void {
  /* Every environment's graph from Vite 6 on; before it, the one graph a server had. */
  const environments = server.environments as typeof server.environments | undefined;
  const graphs =
    environments === undefined ? [] : Object.values(environments).map((each) => each.moduleGraph);
  for (const graph of graphs) invalidateRoutes(graph);
  if (environments === undefined) invalidateRoutes(server.moduleGraph);
  server.ws.send({ type: "full-reload" });
}

/** A graph of the modules Vite served, by the part that forgets one. */
interface ModuleGraphLike<TNode> {
  getModuleById(id: string): TNode | undefined;
  invalidateModule(node: TNode): void;
}

function invalidateRoutes<TNode>(graph: ModuleGraphLike<TNode>): void {
  const module = graph.getModuleById(ROUTES_MODULE_ID);
  if (module !== undefined) graph.invalidateModule(module);
}
