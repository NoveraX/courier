/**
 * Main Studio server setup.
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createLogger } from "@noverax/courier";
import { formatStudioUrl, STUDIO_DEFAULT_PORT } from "@noverax/courier/config";
import express from "express";
import { setProjectRoot } from "../context";
import { BindingTable } from "./catalog/binding-table";
import { createLifecycleCoordinator } from "./mock-manager";
import { createMockRegistry, type MockRegistry } from "./mock-registry";
import { registerRestApi } from "./rest-api";
import { setupRuntimeNamespace } from "./runtime-namespace";
import { clearStudioServerState } from "./runtime-namespace-state";
import { createRuntimePlaygroundRouter } from "./runtime-playground-router";
import { serveStudioUi } from "./serve-ui";
import { clearBuffer } from "./session-buffer";
import { setupUiNamespace } from "./socket-handlers";
import { createStudioSockets } from "./socket-server";
import { createStudioOriginPolicy } from "./studio-origin";
import type { StudioServer, StudioServerOptions } from "./types";
import { watchConfigDriven } from "./watch-config-driven";
import { createWatcherStatus } from "./watcher-status";

const log = createLogger("Studio");

/** Vite dev-server origin used by the Studio UI during local development */
const STUDIO_UI_DEV_ORIGIN = "http://localhost:4382";

/** Where mock-server port allocation starts when nothing says otherwise. */
const DEFAULT_MOCK_BASE_PORT = 7001;

export function createStudioServer(options: StudioServerOptions = {}): StudioServer {
  const {
    port = STUDIO_DEFAULT_PORT,
    host = "localhost",
    projectRoot = process.cwd(),
    mockBasePort = DEFAULT_MOCK_BASE_PORT,
    onReady,
    onError,
    extraCorsOrigins = [],
  } = options;

  setProjectRoot(projectRoot);

  const app = express();
  const httpServer = createServer(app);
  const policy = createStudioOriginPolicy({
    bindHost: host,
    extraOrigins: [STUDIO_UI_DEV_ORIGIN, ...extraCorsOrigins],
  });
  const { io, uiNamespace, runtimeNamespace } = createStudioSockets(httpServer, policy);

  // ── Binding table + /runtime namespace (config-driven routing) ─────────────

  const bindingTable = new BindingTable();
  const playgroundRouter = createRuntimePlaygroundRouter({ bindingTable, uiNamespace });
  setupRuntimeNamespace(runtimeNamespace, { bindingTable, uiNamespace, playgroundRouter });

  // ── Watcher Status (unified hot reload indicator) ──────────────────────────

  const watcherStatus = createWatcherStatus(uiNamespace);

  // ── Mock Server Manager ──────────────────────────────────────────────────

  const mockRegistry: MockRegistry = createMockRegistry();
  const mockManager = createLifecycleCoordinator({
    mockRegistry,
    uiNamespace,
    basePort: mockBasePort,
    watcherStatus,
  });

  const config = watchConfigDriven({
    projectRoot,
    bindingTable,
    mockRegistry,
    uiNamespace,
    watcherStatus,
    mockManager,
  });

  setupUiNamespace({
    uiNamespace,
    bindingTable,
    mockManager,
    watcherStatus,
    playgroundRouter,
  });

  registerRestApi(app, policy);
  serveStudioUi(app);

  // ── Start ────────────────────────────────────────────────────────────────────

  /* Known for certain only once listening: with port 0 the system picks it,
     and the requested one would name an address nothing answers at. */
  let url = formatStudioUrl(host, port);

  /* A port another process holds used to be reported as "Studio already
     running" whoever held it, onReady never fired, and close() rejected
     because the server had never listened; any other listen error was thrown
     from the event handler and took the process down. */
  httpServer.once("error", (err: NodeJS.ErrnoException) => {
    const failure =
      err.code === "EADDRINUSE"
        ? new Error(
            `Port ${port} on ${host} is in use — is Studio already running? Choose another with --port.`,
            { cause: err },
          )
        : err;
    if (onError) onError(failure);
    else log.error("Courier Studio could not start", failure);
  });

  httpServer.listen(port, host, () => {
    url = formatStudioUrl(host, (httpServer.address() as AddressInfo).port);
    onReady?.(url);
  });

  const close = async () => {
    await mockManager.stop();
    config.stop();
    clearBuffer();
    playgroundRouter.dispose();
    clearStudioServerState();
    io.close();
    if (!httpServer.listening) return;
    return new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return {
    get url() {
      return url;
    },
    close,
  };
}
