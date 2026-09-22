/**
 * Main Studio server setup.
 */

import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "@noverax/courier";
import { STUDIO_DEFAULT_PORT } from "@noverax/courier/config";
import compression from "compression";
import express from "express";
import type { RequestHandler } from "express-serve-static-core";
import { Server as SocketIOServer } from "socket.io";
import { setProjectRoot } from "../context";
import { registerApisRoutes } from "./apis-routes";
import { BindingTable } from "./catalog/binding-table";
import type { ConfigWatcher } from "./config-watcher";
import { initProject } from "./init";
import { initConfigDriven } from "./init-config-driven";
import { createLifecycleCoordinator } from "./mock-manager";
import { createMockRegistry, type MockRegistry } from "./mock-registry";
import { setupRuntimeNamespace } from "./runtime-namespace";
import { clearStudioServerState } from "./runtime-namespace-state";
import { createRuntimePlaygroundRouter } from "./runtime-playground-router";
import { clearBuffer } from "./session-buffer";
import { registerSessionRoutes } from "./session-routes";
import { setupUiNamespace } from "./socket-handlers";
import type { StudioServer, StudioServerOptions } from "./types";
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
    extraCorsOrigins = [],
  } = options;

  setProjectRoot(projectRoot);

  const app = express();
  const httpServer = createServer(app);
  const corsOrigins = [
    `http://${host}:${port}`,
    `http://localhost:${port}`,
    STUDIO_UI_DEV_ORIGIN,
    ...extraCorsOrigins,
  ];

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ["GET", "POST"],
    },
    serveClient: false,
  });

  // ── Namespaces ───────────────────────────────────────────────────────────────

  const uiNamespace = io.of("/ui");
  const runtimeNamespace = io.of("/runtime");

  // ── Binding table + /runtime namespace (config-driven routing) ─────────────

  const bindingTable = new BindingTable();
  const playgroundRouter = createRuntimePlaygroundRouter({ bindingTable, uiNamespace });
  setupRuntimeNamespace(runtimeNamespace, { bindingTable, uiNamespace, playgroundRouter });

  // ── Init (registry + .gitignore) ────────────────────────────────────────────

  initProject();

  // ── Watcher Status (unified hot reload indicator) ──────────────────────────

  const watcherStatus = createWatcherStatus(uiNamespace);

  // ── Mock Server Manager ──────────────────────────────────────────────────

  let loadedConfigPath: string | null = null;
  const mockRegistry: MockRegistry = createMockRegistry();
  const mockManager = createLifecycleCoordinator({
    mockRegistry,
    getConfigPath: () => loadedConfigPath,
    uiNamespace,
    basePort: mockBasePort,
    watcherStatus,
  });
  mockManager.start();

  let configWatcher: ConfigWatcher | null = null;
  let closed = false;
  void initConfigDriven({
    projectRoot,
    bindingTable,
    mockRegistry,
    uiNamespace,
    watcherStatus,
    setConfigPath: (path) => {
      loadedConfigPath = path;
    },
  })
    .then((watcher) => {
      if (!watcher) return;
      // If close() ran before the async load resolved, stop the freshly
      // attached watcher immediately so its fs.watch handles do not leak.
      if (closed) {
        watcher.stop();
        return;
      }
      configWatcher = watcher;
    })
    .catch((err) => {
      log.warn("courier.config initialization failed", err);
    });

  setupUiNamespace({
    uiNamespace,
    bindingTable,
    mockManager,
    watcherStatus,
    playgroundRouter,
  });

  // ── REST API ─────────────────────────────────────────────────────────────────

  app.use(compression());
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  registerApisRoutes(app);
  registerSessionRoutes(app);

  // ── Static UI serving ────────────────────────────────────────────────────────

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const uiDistPath = join(__dirname, "..", "ui", "dist");

  if (existsSync(uiDistPath)) {
    // Hashed assets — immutable cache (hash in filename = safe to cache forever)
    const serveAssets = express.static(join(uiDistPath, "assets")) as RequestHandler;
    const setCacheHeaders: RequestHandler = (_req, res, next) => {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return serveAssets(_req, res, next);
    };
    app.use("/assets", setCacheHeaders);
    app.use(express.static(uiDistPath));
    // SPA fallback — Express 5 requires named param for catch-all
    app.get("/{*splat}", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(join(uiDistPath, "index.html"));
    });
  }

  // ── Start ────────────────────────────────────────────────────────────────────

  const url = `http://${host}:${port}`;

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log.info(`Courier Studio already running on ${url}`);
      return;
    }
    throw err;
  });

  httpServer.listen(port, host, () => {
    onReady?.(url);
  });

  const close = async () => {
    closed = true;
    await mockManager.stop();
    configWatcher?.stop();
    clearBuffer();
    playgroundRouter.dispose();
    clearStudioServerState();
    io.close();
    return new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return { url, close };
}
