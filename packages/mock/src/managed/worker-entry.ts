/**
 * Child process entry point for managed mock servers.
 *
 * Loaded by Studio via child_process.fork().
 * Receives config path via IPC, loads it, starts the server,
 * and forwards events back to parent via IPC.
 */

import { handleCommand } from "./command-dispatch";
import { isMockServerDefinition } from "./define-mock-server";
import { wireRequestHooks } from "./request-hooks";
import { buildScenarioMeta } from "./scenario-meta";
import type { ParentMessage } from "./types";
import { parentCheck, send, sendError } from "./worker-ipc";

async function loadMock(configPath: string, mockKey: string): Promise<unknown> {
  const url = `${configPath}?t=${Date.now()}`;
  const mod = await import(url);
  const root = (mod.default ?? mod) as { mocks?: Record<string, unknown> } | undefined;
  return root?.mocks?.[mockKey];
}

async function startServer(
  configPath: string,
  mockKey: string,
  allocatedPort: number,
): Promise<void> {
  const config = await loadMock(configPath, mockKey);

  if (!isMockServerDefinition(config)) {
    return sendError(
      `nexus.config.ts at ${configPath} has no valid mockServer at mocks["${mockKey}"]. Use defineMockServer().`,
      true,
    );
  }

  const { createAutoMockServer } = await import("../auto/create-auto-server");

  if (!config.source) {
    return sendError("Mock server requires a source. Pass source to defineMockServer().", true);
  }

  const port = allocatedPort > 0 ? allocatedPort : config.port;

  const server = createAutoMockServer({
    source: config.source,
    port,
    cors: config.cors,
    admin: config.admin,
    log: config.log,
    seed: config.seed,
    overrides: config.overrides,
    scenarios: config.scenarios,
    studio: false,
  });

  const { analyzeRoutes, getSourceGroupNames } = await import("../auto/route-analyzer");
  const analyzedRoutes = config.source ? analyzeRoutes(config.source) : [];
  const groupNames = config.source ? getSourceGroupNames(config.source) : new Set<string>();

  const buildUiRoutes = () =>
    analyzedRoutes.map((r) => ({
      group: groupNames.has(r.group) ? r.group : "",
      endpoint: r.endpoint,
      httpMethod: r.httpMethod,
      path: r.path,
      fullPath: r.fullPath,
      source: server.getRouteSource(r.group, r.endpoint),
      hits: 0,
    }));

  wireRequestHooks(server);

  const info = await server.start();
  const scenarioMeta = buildScenarioMeta(server.scenarios, analyzedRoutes);

  send({
    type: "ready",
    port: info.port,
    url: info.url,
    routes: buildUiRoutes(),
    scenarios: scenarioMeta,
    collections: server.store.list().map((name) => ({
      name,
      count: server.store.collection(name).count(),
      records: server.store.collection(name).getAll(),
    })),
  });

  process.on("message", async (msg: ParentMessage) => {
    if (msg.type === "stop") {
      await server.stop();
      send({ type: "stopped" });
      clearInterval(parentCheck);
      process.exit(0);
    }
    if (msg.type === "command") {
      await handleCommand(server, analyzedRoutes, msg, buildUiRoutes);
    }
  });
}

// Wait for start command from parent
process.on("message", (msg: ParentMessage) => {
  if (msg.type === "start") {
    startServer(msg.configPath, msg.mockKey, msg.port).catch((err) => {
      sendError(err instanceof Error ? err.message : String(err), true);
    });
  }
});
