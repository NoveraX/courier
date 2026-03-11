/**
 * Main DevTools server setup.
 */

import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server as SocketIOServer } from "socket.io";
import { registerCodegenRoutes } from "./codegen-routes";
import { setupAppNamespace, setupUiNamespace } from "./socket-handlers";
import type { DevToolsServer, DevToolsServerOptions, SessionInfo } from "./types";

export function createDevToolsServer(options: DevToolsServerOptions = {}): DevToolsServer {
  const { port = 4380, host = "localhost", onReady } = options;

  const app = express();
  const httpServer = createServer(app);
  const sessions = new Map<string, SessionInfo>();

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: [`http://${host}:${port}`, `http://localhost:${port}`, "http://localhost:4381"],
      methods: ["GET", "POST"],
    },
    serveClient: false,
  });

  // ── Namespaces ───────────────────────────────────────────────────────────────

  const appNamespace = io.of("/app");
  const uiNamespace = io.of("/ui");

  setupAppNamespace(appNamespace, uiNamespace, sessions);
  setupUiNamespace(appNamespace, uiNamespace, sessions);

  // ── REST API ─────────────────────────────────────────────────────────────────

  app.get("/api/sessions", (_req, res) => {
    res.json(Array.from(sessions.values()));
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", sessions: sessions.size });
  });

  // ── Codegen API ────────────────────────────────────────────────────────────

  app.use(express.json({ limit: "5mb" }));
  registerCodegenRoutes(app);

  // ── Static UI serving ────────────────────────────────────────────────────────

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const uiDistPath = join(__dirname, "..", "ui", "dist");

  if (existsSync(uiDistPath)) {
    app.use(express.static(uiDistPath));
    // SPA fallback — Express 5 requires named param for catch-all
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(join(uiDistPath, "index.html"));
    });
  }

  // ── Start ────────────────────────────────────────────────────────────────────

  const url = `http://${host}:${port}`;

  httpServer.listen(port, host, () => {
    onReady?.(url);
  });

  const close = () =>
    new Promise<void>((resolve, reject) => {
      sessions.clear();
      io.close();
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });

  return { url, sessions, close };
}
