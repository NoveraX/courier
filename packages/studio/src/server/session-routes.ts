/**
 * Session management REST API routes.
 *
 * POST /api/sessions/save          — save the requests the UI captured
 * POST /api/sessions/list          — list saved sessions (summaries)
 * POST /api/sessions/load          — load a saved session by id
 * POST /api/sessions/delete        — delete a saved session by id
 * POST /api/sessions/export        — export session (har/json/postman)
 */

import { sendRouteFailure } from "./route-failure";
import type { JsonResponse, RouteApp } from "./route-types";
import { readExportBody, readIdBody, readSaveBody, type SessionRefusal } from "./session-body";
import { buildSession } from "./session-builder";
import { exportAsHar, exportAsJson, exportAsPostman } from "./session-export";
import { deleteSession, listSessions, loadSession, saveSession } from "./session-store";

const EXPORTERS = { har: exportAsHar, json: exportAsJson, postman: exportAsPostman } as const;

function refuse(res: JsonResponse, { error, status }: SessionRefusal): void {
  res.status(status).json({ error });
}

/* Answer with what a route found — 404 for no session — or the failure it threw, a linked `.courier` among them. */
function answer(res: JsonResponse, fallback: string, run: () => unknown): void {
  try {
    const result = run();
    if (result === null) res.status(404).json({ error: "Session not found" });
    else res.json(result);
  } catch (err) {
    sendRouteFailure(res, err, fallback);
  }
}

/**
 * Mount the routes that save, list, load, delete and export sessions.
 *
 * @param app - The Studio server's Express app
 * @example
 * ```ts
 * registerSessionRoutes(app);
 * ```
 */
export function registerSessionRoutes(app: RouteApp): void {
  app.post("/api/sessions/save", (req, res) => {
    const read = readSaveBody(req.body);
    if ("error" in read) return refuse(res, read);
    answer(res, "Failed to save the session", () => {
      const session = buildSession(read);
      saveSession(session);
      return { id: session.id, name: session.name };
    });
  });

  app.post("/api/sessions/list", (_req, res) => {
    answer(res, "Failed to list the saved sessions", listSessions);
  });

  app.post("/api/sessions/load", (req, res) => {
    const read = readIdBody(req.body);
    if ("error" in read) return refuse(res, read);
    answer(res, "Failed to load the session", () => loadSession(read.id));
  });

  app.post("/api/sessions/delete", (req, res) => {
    const read = readIdBody(req.body);
    if ("error" in read) return refuse(res, read);
    answer(res, "Failed to delete the session", () =>
      deleteSession(read.id) ? { success: true } : null,
    );
  });

  app.post("/api/sessions/export", (req, res) => {
    const read = readExportBody(req.body);
    if ("error" in read) return refuse(res, read);
    answer(res, "Failed to export the session", () => {
      const session = loadSession(read.id);
      return session === null ? null : EXPORTERS[read.format](session);
    });
  });
}
