import { basename } from "node:path";
import type { ViteDevServer } from "vite";

import { CONFIG_BASENAMES } from "../config/config-candidates";
import { ROUTES_MODULE_ID } from "./routes-module-id";
import type { RoutesPluginState } from "./routes-plugin-state";

/**
 * Read the routes again once a config appears where none was: a dev server
 * started before the project had one serves a routes module that fails, and
 * a config saved afterwards brings the page back with its routes.
 *
 * @param server - The dev server, whose watcher sees the project's files
 * @param state - What the plugin knows: whether any routes were read yet
 * @example
 * ```ts
 * configureServer(server) { watchForConfig(server, state); }
 * ```
 */
export function watchForConfig(server: ViteDevServer, state: RoutesPluginState): void {
  server.watcher.on("add", (file) => {
    if (state.engine?.last !== undefined || !CONFIG_BASENAMES.includes(basename(file))) return;
    /* Every environment's graph from Vite 6 on; before it, the one graph a server had. */
    const environments = server.environments as typeof server.environments | undefined;
    const graphs =
      environments === undefined ? [] : Object.values(environments).map((each) => each.moduleGraph);
    for (const graph of graphs) invalidateRoutes(graph);
    if (environments === undefined) invalidateRoutes(server.moduleGraph);
    server.ws.send({ type: "full-reload" });
  });
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
