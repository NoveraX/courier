/**
 * The mock server process Studio starts for a mock declared in courier.mocks.
 *
 * Studio forks its own entry, which calls {@link runMockWorker} with the
 * loader Studio loads the mocks file with, so the worker reads it exactly as
 * Studio does — TypeScript, path aliases and all — with nothing else to
 * install.
 */

import { dirname, resolve } from "node:path";
import { createKeptBodies } from "@noverax/courier/internal";

import { createAutoMockServer } from "../auto/create-auto-server";
import { analyzeRoutes, getSourceGroupNames } from "../auto/route-analyzer";
import { seedOptionsOf } from "../auto/seed-options";
import { networkConfigOnWire } from "../network/network-config-on-wire";
import type { MockServer } from "../server/mock-server-types";
import { handleCommand } from "./command-dispatch";
import { isMockServerDefinition } from "./define-mock-server";
import type { DescribedRoute } from "./describe-route";
import { describeRoute } from "./describe-route";
import { reportHalts } from "./network-commands";
import { wireRequestHooks } from "./request-hooks";
import { buildScenarioMeta } from "./scenario-meta";
import { startFailure } from "./start-failure";
import { createStoreFeed } from "./store-feed";
import type { MockServerDefinition, ParentMessage, ServedMock } from "./types";
import { send, sendError, watchParent } from "./worker-ipc";

/**
 * Reads the mock declared under `mockKey` in the mocks file at `mocksFile`,
 * reusing the transforms Studio keeps in `transformCacheDirectory`, if any.
 */
export type MockDefinitionLoader = (
  mocksFile: string,
  mockKey: string,
  transformCacheDirectory: string | null,
) => Promise<unknown>;

type StartMessage = Extract<ParentMessage, { type: "start" }>;
type CommandMessage = Extract<ParentMessage, { type: "command" }>;

const STARTING = "The mock is still starting. Try again once it runs.";

/**
 * Serve the mock Studio asks for over IPC, until Studio stops it or goes away.
 *
 * Call it in the process Studio forks for a mock. Studio's start message
 * names the mocks file, the mock's key, the port and where Studio keeps
 * transforms; the worker loads the definition with `loadDefinition`, starts
 * the server and reports it ready, and a definition that is not a
 * `defineMockServer()` result, or has no source, is reported as a fatal
 * error, which ends the process. The worker listens on exactly the port Studio sends: Studio chose
 * it, and keeps the ports other mocks declared out of its way. A stop is
 * honoured at any point, also while the mocks file is still loading, and
 * ends the process.
 *
 * @param loadDefinition - Loads the definition declared under a key of the mocks file
 * @returns Nothing; the worker runs until Studio stops it or disconnects
 *
 * @example
 * ```ts
 * // mock-worker.ts — the entry Studio forks
 * import { runMockWorker } from "@noverax/courier-mock/managed";
 * import { loadCourierMocksFile } from "@noverax/courier-studio-core/config";
 *
 * runMockWorker(async (mocksFile, mockKey) => {
 *   const { mocks } = await loadCourierMocksFile(mocksFile);
 *   return Object.hasOwn(mocks, mockKey) ? mocks[mockKey] : undefined;
 * });
 * ```
 */
export function runMockWorker(loadDefinition: MockDefinitionLoader): void {
  watchParent();
  let served: ServedMock | undefined;
  let stopping = false;

  process.on("message", (msg: ParentMessage) => {
    if (msg.type === "start" && served === undefined) {
      start(loadDefinition, msg, () => stopping)
        .then((started) => {
          served = started;
        })
        .catch((err: unknown) => {
          sendError(startFailure(err), true);
        });
    } else if (msg.type === "stop" && !stopping) {
      stopping = true;
      void stop(served);
    } else if (msg.type === "command") {
      answerCommand(served, msg);
    }
  });
}

async function start(
  loadDefinition: MockDefinitionLoader,
  msg: StartMessage,
  stopping: () => boolean,
): Promise<ServedMock | undefined> {
  const definition = await loadDefinition(msg.mocksFile, msg.mockKey, msg.transformCacheDirectory);
  if (stopping()) return undefined;
  if (!isMockServerDefinition(definition)) {
    sendError(
      `Mock "${msg.mockKey}" in ${msg.mocksFile} is not a defineMockServer() definition.`,
      true,
    );
    return undefined;
  }
  if (!definition.source) {
    sendError(
      `Mock "${msg.mockKey}" in ${msg.mocksFile} has no source. Pass one to defineMockServer().`,
      true,
    );
    return undefined;
  }
  const server = createServer(definition, msg);
  const served: ServedMock = {
    server,
    routes: analyzeRoutes(definition.source),
    groupNames: getSourceGroupNames(definition.source),
    seed: seedOptionsOf(definition.seed),
    feed: createStoreFeed(server.store),
    bodies: createKeptBodies(),
  };
  wireRequestHooks(served);
  reportHalts(served.server);
  const info = await served.server.start();
  if (stopping()) return served;
  send({
    type: "ready",
    port: info.port,
    url: info.url,
    routes: uiRoutes(served),
    scenarios: buildScenarioMeta(
      served.server.scenarios,
      served.routes,
      served.server.activeScenario,
    ),
    network: networkConfigOnWire(served.server.networkState),
    collections: served.feed.start(),
  });
  return served;
}

function createServer(
  definition: MockServerDefinition,
  { port, storeFile, mocksFile }: Pick<StartMessage, "port" | "storeFile" | "mocksFile">,
): MockServer {
  return createAutoMockServer({
    source: definition.source,
    port,
    strictPort: true,
    ...(storeFile !== null && definition.persist !== false && { persist: { file: storeFile } }),
    ...(definition.endpoints && { endpoints: definition.endpoints }),
    /* Relative to the mocks file that names it, wherever Studio runs from. */
    ...(definition.fixtures && {
      fixtures: { file: resolve(dirname(mocksFile), definition.fixtures) },
    }),
    ...(definition.hostname && { hostname: definition.hostname }),
    cors: definition.cors,
    admin: definition.admin,
    log: definition.log,
    seed: definition.seed,
    overrides: definition.overrides,
    scenarios: definition.scenarios,
    network: definition.network,
  });
}

/* Studio waits for an answer to every command, so one that arrives while the
   mock still starts is answered too. */
function answerCommand(served: ServedMock | undefined, msg: CommandMessage): void {
  if (served) {
    handleCommand(served, msg, () => uiRoutes(served));
    return;
  }
  send({ type: "command-result", requestId: msg.requestId, ok: false, error: STARTING });
}

function uiRoutes({ server, routes, groupNames }: ServedMock): DescribedRoute[] {
  return routes.map((route) =>
    describeRoute(route, groupNames, server.getRouteSource(route.group, route.endpoint)),
  );
}

/* Nothing is running while the config still loads, so a stop then ends the
   process at once; the start in flight goes with it. The requests a stop
   lets finish change the store too, and Studio is told those changes. */
async function stop(served: ServedMock | undefined): Promise<void> {
  await served?.server.stop();
  served?.feed.close();
  send({ type: "stopped" });
  process.exit(0);
}
