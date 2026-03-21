/**
 * Child process entry point for managed mock servers.
 *
 * Loaded by DevTools via child_process.fork().
 * Receives config path via IPC, loads it, starts the server,
 * and forwards events back to parent via IPC.
 */

import { isMockServerDefinition } from "./define-mock-server";
import type { ChildMessage, ParentMessage } from "./types";

const PARENT_CHECK_INTERVAL = 5000;

// Ensure child dies if parent dies
const parentPid = process.ppid;
const parentCheck = setInterval(() => {
  try {
    process.kill(parentPid, 0);
  } catch {
    process.exit(0);
  }
}, PARENT_CHECK_INTERVAL);

function send(msg: ChildMessage): void {
  process.send?.(msg);
}

function sendError(message: string, fatal: boolean): void {
  send({ type: "error", message, fatal });
  if (fatal) {
    clearInterval(parentCheck);
    process.exit(1);
  }
}

async function loadConfig(configPath: string): Promise<unknown> {
  // Cache-bust: append query param so ESM reimports on restart
  const url = `${configPath}?t=${Date.now()}`;
  const mod = await import(url);
  return mod.mockServer ?? mod.default;
}

async function startServer(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);

  if (!isMockServerDefinition(config)) {
    return sendError(
      `File ${configPath} does not export a valid mockServer. Use defineMockServer().`,
      true,
    );
  }

  // Dynamic import to avoid loading heavy deps at module level
  const { createAutoMockServer } = await import("../auto/create-auto-server");

  if (!config.source) {
    return sendError("Mock server requires a source. Pass source to defineMockServer().", true);
  }

  const server = createAutoMockServer({
    source: config.source,
    port: config.port,
    cors: config.cors,
    admin: config.admin,
    log: config.log,
    seed: config.seed,
    overrides: config.overrides,
    scenarios: config.scenarios,
    devtools: false, // No Socket.IO bridge — IPC replaces it
  });

  const { analyzeRoutes } = await import("../auto/route-analyzer");
  const routes = config.source
    ? analyzeRoutes(config.source.options.groups).map((r) => ({
        group: r.group,
        endpoint: r.endpoint,
        httpMethod: r.httpMethod,
        path: r.path,
        fullPath: r.fullPath,
        source: "auto" as const,
        hits: 0,
      }))
    : [];

  const info = await server.start();

  send({
    type: "ready",
    port: info.port,
    url: info.url,
    routes,
    collections: server.store.list().map((name) => ({
      name,
      count: server.store.collection(name).count(),
    })),
  });

  // Forward store/scenario events via IPC (TODO: wire up)

  // Handle commands from parent
  process.on("message", async (msg: ParentMessage) => {
    if (msg.type === "stop") {
      await server.stop();
      send({ type: "stopped" });
      clearInterval(parentCheck);
      process.exit(0);
    }
  });
}

// Wait for start command from parent
process.on("message", (msg: ParentMessage) => {
  if (msg.type === "start") {
    startServer(msg.configPath).catch((err) => {
      sendError(err instanceof Error ? err.message : String(err), true);
    });
  }
});
