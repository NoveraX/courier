import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server as SocketIOServer } from "socket.io";
import { type GenerateOptions, generateCode, type ParsedSpec, parseSpec } from "./codegen/index.js";

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
    cors: {
      origin: [`http://${host}:${port}`, `http://localhost:${port}`, "http://localhost:4381"],
      methods: ["GET", "POST"],
    },
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
        socket.data.sessionId = sessionId;
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

    // Replay: re-execute a request from timeline (result streams back as events)
    socket.on(
      "replay",
      (
        payload: {
          source: string;
          group: string;
          method: string;
          variables: unknown;
          headers: Record<string, string>;
          mode: "direct" | "proxy";
        },
        callback: (result: { ok: boolean; error?: string }) => void,
      ) => {
        const appSockets = Array.from(appNamespace.sockets.values());
        if (appSockets.length === 0) {
          callback({ ok: false, error: "No application connected" });
          return;
        }

        let responded = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const respond = (result: { ok: boolean; error?: string }) => {
          if (responded) return;
          responded = true;
          clearTimeout(timeoutId);
          callback(result);
        };

        const targetSocket = appSockets[0] as (typeof appSockets)[number];
        targetSocket.emit(
          "playground:execute",
          {
            source: payload.source,
            group: payload.group,
            method: payload.method,
            variables: payload.variables,
            headers: payload.headers ?? {},
            mode: payload.mode,
          },
          (result: Record<string, unknown>) => {
            if (result.error) {
              respond({ ok: false, error: String(result.error) });
            } else {
              respond({ ok: true });
            }
          },
        );

        timeoutId = setTimeout(() => {
          respond({ ok: false, error: "Application did not respond within 15s" });
        }, 15_000);
      },
    );

    // Playground: forward request to a connected app and return the result
    socket.on(
      "playground:send",
      (
        payload: {
          sessionId?: string;
          source: string;
          group: string;
          method: string;
          variables: unknown;
          headers: Record<string, string>;
          mode: "direct" | "proxy";
        },
        callback: (result: Record<string, unknown>) => void,
      ) => {
        // Pick target app socket — explicit sessionId or first available
        const appSockets = Array.from(appNamespace.sockets.values());
        if (appSockets.length === 0) {
          callback({
            error:
              "No application connected. Start your app with the Nexus devtools plugin enabled.",
            status: 0,
            headers: {},
            duration: 0,
          });
          return;
        }

        let targetSocket = appSockets[0] as (typeof appSockets)[number];
        if (payload.sessionId) {
          const found = appSockets.find((s) => s.data?.sessionId === payload.sessionId);
          if (found) targetSocket = found;
        }

        const startTime = Date.now();
        let responded = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const respond = (result: Record<string, unknown>) => {
          if (responded) return;
          responded = true;
          clearTimeout(timeoutId);
          callback(result);
        };

        targetSocket.emit(
          "playground:execute",
          {
            source: payload.source,
            group: payload.group,
            method: payload.method,
            variables: payload.variables,
            headers: payload.headers,
            mode: payload.mode,
          },
          (result: Record<string, unknown>) => {
            respond({
              ...result,
              duration: result.duration ?? Date.now() - startTime,
            });
          },
        );

        timeoutId = setTimeout(() => {
          respond({
            error: "Application did not respond within 30s",
            status: 0,
            headers: {},
            duration: Date.now() - startTime,
          });
        }, 30_000);
      },
    );
  });

  // ── REST API ─────────────────────────────────────────────────────────────────

  app.get("/api/sessions", (_req, res) => {
    res.json(Array.from(sessions.values()));
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", sessions: sessions.size });
  });

  // ── Codegen API ────────────────────────────────────────────────────────────

  app.use(express.json({ limit: "5mb" }));

  // Parse spec (URL, raw content, or file path)
  app.post("/api/codegen/parse", async (req, res) => {
    try {
      const { source, content } = req.body as { source: "url" | "raw" | "file"; content: string };
      let raw: string;

      if (source === "url") {
        const response = await fetch(content);
        if (!response.ok) {
          res
            .status(400)
            .json({ error: `Failed to fetch spec: ${response.status} ${response.statusText}` });
          return;
        }
        raw = await response.text();
      } else if (source === "file") {
        const { readFileSync } = await import("node:fs");
        const filePath = resolve(content);
        if (!existsSync(filePath)) {
          res.status(400).json({ error: `File not found: ${filePath}` });
          return;
        }
        raw = readFileSync(filePath, "utf-8");
      } else {
        raw = content;
      }

      const spec = parseSpec(raw);
      res.json(spec);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to parse spec" });
    }
  });

  // Generate code from parsed spec + options
  app.post("/api/codegen/generate", (req, res) => {
    try {
      const { spec, options } = req.body as { spec: ParsedSpec; options: GenerateOptions };
      const files = generateCode(spec, options);
      res.json({ files });
    } catch (err) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : "Code generation failed" });
    }
  });

  // Write generated files to disk
  app.post("/api/codegen/write", (req, res) => {
    try {
      const { files } = req.body as { files: { path: string; content: string }[] };
      let written = 0;

      for (const file of files) {
        const filePath = resolve(file.path);
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(filePath, file.content, "utf-8");
        written++;
      }

      res.json({ written, files: files.map((f) => f.path) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to write files" });
    }
  });

  // Save codegen config as codegen.nexus.json
  app.post("/api/codegen/save-config", (req, res) => {
    try {
      const { config, path: configPath } = req.body as { config: unknown; path?: string };
      const filePath = resolve(configPath ?? "codegen.nexus.json");
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
      res.json({ path: filePath });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save config" });
    }
  });

  // Load codegen config
  app.post("/api/codegen/load-config", (req, res) => {
    try {
      const { path: configPath } = req.body as { path?: string };
      const filePath = resolve(configPath ?? "codegen.nexus.json");

      if (!existsSync(filePath)) {
        res.status(404).json({ error: "Config file not found" });
        return;
      }
      const { readFileSync } = require("node:fs") as typeof import("node:fs");
      const content = readFileSync(filePath, "utf-8");
      res.json(JSON.parse(content));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load config" });
    }
  });

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
