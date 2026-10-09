import { isRecord } from "../mocks-edit/is-record";
import type { ProjectReads } from "../project-state/types";
import type { RequestLog } from "../request-log";
import type { RouteApp } from "../route-types";
import { codeCalls } from "./calls-in-text";
import { type CatalogEndpoint, endpointCatalog } from "./endpoint-catalog";
import { endpointStats } from "./endpoint-stats";
import { matchCalls } from "./match-calls";
import { createSiteIndex } from "./site-index";

/** What the editor routes read. */
export interface EditorRouteDeps {
  project: Pick<ProjectReads, "snapshot">;
  requestLog: Pick<RequestLog, "events">;
  root: string;
}

/* A file an editor sends to be read: larger ones are generated, and hold no call worth a hint. */
const LARGEST_TEXT = 1024 * 1024;

/**
 * Mount the routes an editor reads Studio through, beside a call to an
 * endpoint and from Studio to the call:
 *
 * POST /api/editor/endpoints — how each endpoint's calls went: calls, failures, statuses, p50 and p95
 * POST /api/editor/calls — the endpoint calls in a file the editor sends (`{ file, text }`), each placed
 * POST /api/editor/sites — where the project's code calls one endpoint (`{ source, endpoint }`)
 *
 * They read and change nothing else, so they need no token: a process on
 * this machine reads them as the Studio page does.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project, its requests, and its root
 * @example
 * ```ts
 * registerEditorRoutes(app, { project, requestLog, root });
 * ```
 */
export function registerEditorRoutes(app: RouteApp, deps: EditorRouteDeps): void {
  const catalog = (): readonly CatalogEndpoint[] => {
    const running = deps.project.snapshot().running;
    return running ? endpointCatalog(running.config.sources) : [];
  };
  const sites = createSiteIndex(deps.root, catalog);

  app.post("/api/editor/endpoints", (_req, res) => {
    res.json({ endpoints: endpointStats(deps.requestLog.events(), catalog()) });
  });

  app.post("/api/editor/calls", (req, res) => {
    const { file, text } = isRecord(req.body) ? req.body : {};
    if (typeof file !== "string" || typeof text !== "string" || text.length > LARGEST_TEXT) {
      res
        .status(400)
        .json({ error: "Send the file's name and its text, at most 1 MB: { file, text }." });
      return;
    }
    res.json({ calls: matchCalls(codeCalls(file, text), catalog(), text) });
  });

  app.post("/api/editor/sites", async (req, res) => {
    const { source, endpoint } = isRecord(req.body) ? req.body : {};
    if (typeof source !== "string" || typeof endpoint !== "string") {
      res.status(400).json({ error: "Name the endpoint: { source, endpoint }." });
      return;
    }
    res.json({ sites: await sites.sitesOf(source, endpoint) });
  });
}
