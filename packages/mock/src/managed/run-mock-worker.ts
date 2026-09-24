/**
 * The mock server process Studio starts for a mock declared in courier.config.
 *
 * Studio forks its own entry, which calls {@link runMockWorker} with the
 * loader Studio loads the config with, so the worker reads the config exactly
 * as Studio does — TypeScript, path aliases and all — with nothing else to
 * install.
 */

import { createAutoMockServer } from "../auto/create-auto-server";
import type { RouteInfo } from "../auto/route-analyzer";
import { analyzeRoutes, getSourceGroupNames } from "../auto/route-analyzer";
import type { MockServer } from "../server/mock-server-types";
import { handleCommand } from "./command-dispatch";
import { isMockServerDefinition } from "./define-mock-server";
import type { DescribedRoute } from "./describe-route";
import { describeRoute } from "./describe-route";
import { wireRequestHooks } from "./request-hooks";
import { buildScenarioMeta } from "./scenario-meta";
import type { MockServerDefinition, ParentMessage } from "./types";
import { send, sendError, watchParent } from "./worker-ipc";

/** Reads `mocks[mockKey]` from the config file at `configFile`. */
export type MockDefinitionLoader = (configFile: string, mockKey: string) => Promise<unknown>;

type StartMessage = Extract<ParentMessage, { type: "start" }>;

/**
 * Serve the mock Studio asks for over IPC, until Studio stops it or goes away.
 *
 * The worker listens on exactly the port Studio sends: Studio chose it, and
 * keeps the ports other mocks declared out of its way. A stop is honoured at
 * any point, also while the config is still loading.
 *
 * @param loadDefinition - Loads a mock definition from the config file.
 *
 * @example
 * ```ts
 * // mock-worker.ts — the entry Studio forks
 * import { runMockWorker } from "@noverax/courier-mock/managed";
 *
 * runMockWorker(async (configFile, mockKey) => (await loadConfig(configFile)).mocks?.[mockKey]);
 * ```
 */
export function runMockWorker(loadDefinition: MockDefinitionLoader): void {
  watchParent();
  let served: Served | undefined;
  let stopping = false;

  process.on("message", (msg: ParentMessage) => {
    if (msg.type === "start" && served === undefined) {
      start(loadDefinition, msg, () => stopping)
        .then((started) => {
          served = started;
        })
        .catch((err: unknown) => {
          sendError(err instanceof Error ? (err.stack ?? err.message) : String(err), true);
        });
    } else if (msg.type === "stop" && !stopping) {
      stopping = true;
      void stop(served?.server);
    } else if (msg.type === "command" && served) {
      const current = served;
      void handleCommand(current.server, current.routes, msg, () => uiRoutes(current));
    }
  });
}

/** A running mock server and the routes it serves. */
interface Served {
  server: MockServer;
  routes: RouteInfo[];
  groupNames: Set<string>;
}

async function start(
  loadDefinition: MockDefinitionLoader,
  msg: StartMessage,
  stopping: () => boolean,
): Promise<Served | undefined> {
  const definition = await loadDefinition(msg.configPath, msg.mockKey);
  if (stopping()) return undefined;
  if (!isMockServerDefinition(definition)) {
    sendError(
      `mocks.${msg.mockKey} in ${msg.configPath} is not a defineMockServer() definition.`,
      true,
    );
    return undefined;
  }
  if (!definition.source) {
    sendError(`mocks.${msg.mockKey} has no source. Pass one to defineMockServer().`, true);
    return undefined;
  }
  const served: Served = {
    server: createServer(definition, msg.port),
    routes: analyzeRoutes(definition.source),
    groupNames: getSourceGroupNames(definition.source),
  };
  wireRequestHooks(served.server);
  const info = await served.server.start();
  if (stopping()) return served;
  send({
    type: "ready",
    port: info.port,
    url: info.url,
    routes: uiRoutes(served),
    scenarios: buildScenarioMeta(served.server.scenarios, served.routes),
    collections: served.server.store.list().map((name) => ({
      name,
      count: served.server.store.collection(name).count(),
      records: served.server.store.collection(name).getAll(),
    })),
  });
  return served;
}

function createServer(definition: MockServerDefinition, port: number): MockServer {
  return createAutoMockServer({
    source: definition.source,
    port,
    strictPort: true,
    ...(definition.hostname && { hostname: definition.hostname }),
    cors: definition.cors,
    admin: definition.admin,
    log: definition.log,
    seed: definition.seed,
    overrides: definition.overrides,
    scenarios: definition.scenarios,
    network: definition.network,
    studio: false,
  });
}

function uiRoutes({ server, routes, groupNames }: Served): DescribedRoute[] {
  return routes.map((route) =>
    describeRoute(route, groupNames, server.getRouteSource(route.group, route.endpoint)),
  );
}

/* Nothing is running while the config still loads, so a stop then ends the
   process at once; the start in flight goes with it. */
async function stop(server: MockServer | undefined): Promise<void> {
  await server?.stop();
  send({ type: "stopped" });
  process.exit(0);
}
