/**
 * Session management REST API routes.
 *
 * POST /api/sessions/save          — save current session
 * POST /api/sessions/list          — list saved sessions (summaries)
 * POST /api/sessions/load          — load a saved session by id
 * POST /api/sessions/delete        — delete a saved session by id
 * POST /api/sessions/export        — export session (har/json/postman)
 */

import type { RouteApp } from "./route-types";
import { buildSession } from "./session-builder";
import { exportAsHar, exportAsJson, exportAsPostman } from "./session-export";
import { deleteSession, listSessions, loadSession, saveSession } from "./session-store";
import type { SavedSessionApp } from "./session-types";

export function registerSessionRoutes(app: RouteApp): void {
  // ── Save current session ────────────────────────────────────────────────

  app.post("/api/sessions/save", (req, res) => {
    const { requests, apps, name } = req.body;

    if (!Array.isArray(requests)) {
      res.status(400).json({ error: "Missing requests array" });
      return;
    }

    const session = buildSession({
      name: typeof name === "string" ? name : undefined,
      requests: requests as Record<string, unknown>[],
      apps: (apps as SavedSessionApp[]) ?? [],
    });

    saveSession(session);
    res.json({ id: session.id, name: session.name });
  });

  // ── List saved sessions ─────────────────────────────────────────────────

  app.post("/api/sessions/list", (_req, res) => {
    res.json(listSessions());
  });

  // ── Load session ────────────────────────────────────────────────────────

  app.post("/api/sessions/load", (req, res) => {
    const id = req.body["id"];
    if (typeof id !== "string") {
      res.status(400).json({ error: "Missing id" });
      return;
    }

    const session = loadSession(id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(session);
  });

  // ── Delete session ──────────────────────────────────────────────────────

  app.post("/api/sessions/delete", (req, res) => {
    const id = req.body["id"];
    if (typeof id !== "string") {
      res.status(400).json({ error: "Missing id" });
      return;
    }

    const deleted = deleteSession(id);
    if (!deleted) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ success: true });
  });

  // ── Export session ──────────────────────────────────────────────────────

  app.post("/api/sessions/export", (req, res) => {
    const { id, format } = req.body;
    if (typeof id !== "string" || typeof format !== "string") {
      res.status(400).json({ error: "Missing id or format" });
      return;
    }

    const session = loadSession(id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (format === "har") {
      res.json(exportAsHar(session));
      return;
    }
    if (format === "json") {
      res.json(exportAsJson(session));
      return;
    }
    if (format === "postman") {
      res.json(exportAsPostman(session));
      return;
    }

    res.status(400).json({ error: `Unknown format: ${format}. Use har, json, or postman.` });
  });
}
