import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server as SocketIOServer } from "socket.io";

export interface DevToolsServerOptions {
  /** Server port (default: 4380) */
  port?: number;
  /** Server host (default: "localhost") */
  host?: string;
  /** Called when server is ready */
  onReady?: (url: string) => void;
}

export interface DevToolsServer {
  /** Server URL */
  url: string;
  /** Connected app sessions */
  sessions: Map<string, SessionInfo>;
  /** Close the server */
  close: () => Promise<void>;
}

export interface SessionInfo {
  sessionId: string;
  framework: string;
  nexusVersion: string;
  sources: Record<string, unknown>;
  connectedAt: number;
}

export function createDevToolsServer(options: DevToolsServerOptions = {}): DevToolsServer {
  const { port = 4380, host = "localhost", onReady } = options;

  const app = express();
  const httpServer = createServer(app);
  const sessions = new Map<string, SessionInfo>();

  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    serveClient: false,
  });

  // ── Namespaces ───────────────────────────────────────────────────────────────

  const appNamespace = io.of("/app");
  const uiNamespace = io.of("/ui");

  // App instances connect here and send events
  appNamespace.on("connection", (socket) => {
    let sessionId: string | undefined;

    socket.on("event", (event: Record<string, unknown>) => {
      // Track sessions
      if (event.type === "connection:init") {
        sessionId = event.sessionId as string;
        sessions.set(sessionId, {
          sessionId,
          framework: (event.framework as string) ?? "unknown",
          nexusVersion: (event.nexusVersion as string) ?? "0.0.0",
          sources: (event.sources as Record<string, unknown>) ?? {},
          connectedAt: Date.now(),
        });

        // Notify UI of new session
        uiNamespace.emit("session:connect", sessions.get(sessionId));
      }

      // Forward all events to UI namespace
      uiNamespace.emit("event", event);
    });

    socket.on("disconnect", () => {
      if (sessionId) {
        sessions.delete(sessionId);
        uiNamespace.emit("session:disconnect", { sessionId });
      }
    });
  });

  // UI clients connect here and receive events
  uiNamespace.on("connection", (socket) => {
    // Send current sessions to newly connected UI
    socket.emit("sessions", Array.from(sessions.values()));
  });

  // ── REST API ─────────────────────────────────────────────────────────────────

  app.get("/api/sessions", (_req, res) => {
    res.json(Array.from(sessions.values()));
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", sessions: sessions.size });
  });

  // ── Static UI serving ────────────────────────────────────────────────────────

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const uiDistPath = join(__dirname, "..", "ui", "dist");

  if (existsSync(uiDistPath)) {
    app.use(express.static(uiDistPath));
    // SPA fallback
    app.get("*", (_req, res) => {
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
      io.close();
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });

  return { url, sessions, close };
}
