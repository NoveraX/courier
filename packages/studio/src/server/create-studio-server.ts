/**
 * Main Studio server setup.
 */

import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "@noverax/nexus";
import compression from "compression";
import express from "express";
import type { RequestHandler } from "express-serve-static-core";
import { Server as SocketIOServer } from "socket.io";
import { setProjectRoot } from "../context";
import { registerApisRoutes } from "./apis-routes";
import { CatalogStore } from "./catalog";
import { startFileWatcher } from "./file-watcher";
import { initProject } from "./init";
import { createLifecycleCoordinator } from "./mock-manager";
import { clearBuffer } from "./session-buffer";
import { registerSessionRoutes } from "./session-routes";
import { setupAppNamespace, setupUiNamespace } from "./socket-handlers";
import type { SessionInfo, StudioServer, StudioServerOptions } from "./types";
import { createWatcherStatus } from "./watcher-status";

const log = createLogger("Studio");

export function createStudioServer(options: StudioServerOptions = {}): StudioServer {
  const { port = 4380, host = "localhost", projectRoot = process.cwd(), onReady } = options;

  setProjectRoot(projectRoot);

  const app = express();
  const httpServer = createServer(app);
  const sessions = new Map<string, SessionInfo>();
  const catalogStore = new CatalogStore();

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: [`http://${host}:${port}`, `http://localhost:${port}`, "http://localhost:4382"],
      methods: ["GET", "POST"],
    },
    serveClient: false,
  });

  // ── Namespaces ───────────────────────────────────────────────────────────────

  const appNamespace = io.of("/app");
  const uiNamespace = io.of("/ui");

  setupAppNamespace(appNamespace, uiNamespace, sessions, catalogStore);

  // ── Init (registry + .gitignore) ────────────────────────────────────────────

  initProject();

  // ── Watcher Status (unified hot reload indicator) ──────────────────────────

  const watcherStatus = createWatcherStatus(uiNamespace);

  // ── File Watcher (hot reload) ──────────────────────────────────────────────

  const stopWatcher = startFileWatcher(uiNamespace, catalogStore, watcherStatus);

  // ── Mock Server Manager ──────────────────────────────────────────────────

  const mocksDir = join(projectRoot, "mock-servers");
  const mockManager = createLifecycleCoordinator({
    mocksDir,
    uiNamespace,
    basePort: 7001,
    watcherStatus,
  });
  mockManager.start();

  setupUiNamespace(appNamespace, uiNamespace, sessions, catalogStore, mockManager, watcherStatus);

  // ── REST API ─────────────────────────────────────────────────────────────────

  app.use(compression());
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/sessions", (_req, res) => {
    res.json(Array.from(sessions.values()));
  });

  app.get("/api/catalog", (_req, res) => {
    res.json(catalogStore.getSnapshot());
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", sessions: sessions.size });
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
      log.info(`Nexus Studio already running on ${url}`);
      return;
    }
    throw err;
  });

  httpServer.listen(port, host, () => {
    onReady?.(url);
  });

  const close = async () => {
    await mockManager.stop();
    stopWatcher();
    clearBuffer();
    sessions.clear();
    io.close();
    return new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return { url, sessions, close };
}
