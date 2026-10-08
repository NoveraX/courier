import { sendRouteFailure } from "../route-failure";
import type { JsonResponse, RouteApp } from "../route-types";
import { readExportBody, readSaveBody } from "../session-body";
import { buildSession } from "../session-builder";
import type { SessionStore } from "../storage/session-rows";
import type { StudioView } from "../storage/studio-view";
import type { SessionEnvironment } from "./session-environment";
import { readSessionFile, toSessionFile } from "./session-file";

/** What the session file routes read and change. */
export interface SessionFileDeps {
  sessions: SessionStore;
  view: StudioView;
  /** The environment Studio runs in now, for a file made of the live requests or a saved session. */
  environment: () => SessionEnvironment;
}

/**
 * Mount the routes that write a session as a file for a bug report and
 * open one a colleague sent:
 *
 * POST /api/sessions/file        — a saved session (`{ id }`) or the requests a page holds (`{ requests }`), as a file
 * POST /api/sessions/import      — keep a session file as a session of this Studio's, and show it
 * POST /api/sessions/environment — the environment this Studio runs in, to set beside a file's
 *
 * @param app - The Studio server's Express app
 * @param deps - The sessions, what the pages show, and the environment
 * @example
 * ```ts
 * registerSessionFileRoutes(app, { sessions, view, environment: () => sessionEnvironment(root, sources) });
 * ```
 */
export function registerSessionFileRoutes(app: RouteApp, deps: SessionFileDeps): void {
  app.post("/api/sessions/file", (req, res) => {
    answer(res, "Failed to write the session file", () => {
      const body = req.body as { id?: unknown } | undefined;
      if (body?.id !== undefined) {
        const read = readExportBody({ ...body, format: "json" });
        if ("error" in read) return { status: read.status, error: read.error };
        const session = deps.sessions.load(read.id);
        /* The environment it was recorded in, kept when it was saved; one saved before Studio kept it is named by today's. */
        return session === null
          ? { status: 404, error: "Session not found" }
          : toSessionFile(session, session.environment ?? deps.environment());
      }
      const read = readSaveBody(body);
      if ("error" in read) return { status: read.status, error: read.error };
      return toSessionFile(buildSession(read), deps.environment());
    });
  });

  app.post("/api/sessions/environment", (_req, res) => {
    answer(res, "Failed to read the environment", deps.environment);
  });

  app.post("/api/sessions/import", (req, res) => {
    answer(res, "Failed to open the session file", () => {
      const file = readSessionFile((req.body as { file?: unknown } | undefined)?.file);
      if ("error" in file) return { status: 400, error: file.error };
      const read = readSaveBody({ name: file.name, requests: file.requests, apps: file.apps });
      if ("error" in read) return { status: read.status, error: read.error };
      const session = {
        ...buildSession(read),
        ...(file.environment && { environment: file.environment }),
      };
      deps.sessions.save(session);
      deps.view.showSession(session.id);
      return { id: session.id, name: session.name };
    });
  });
}

/* A refusal carries its status; anything else is the answer. */
function answer(res: JsonResponse, fallback: string, run: () => unknown): void {
  try {
    const result = run();
    if (isRefusal(result)) res.status(result.status).json({ error: result.error });
    else res.json(result);
  } catch (err) {
    sendRouteFailure(res, err, fallback);
  }
}

function isRefusal(value: unknown): value is { status: number; error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "error" in value &&
    !("format" in value)
  );
}
