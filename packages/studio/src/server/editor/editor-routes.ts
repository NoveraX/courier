import type { StudioAuditInputs } from "../mcp/audit-tool";
import type { StudioMocks } from "../mcp/mock-tools";
import { isRecord } from "../mocks-edit/is-record";
import type { ProjectReads } from "../project-state/types";
import type { RequestLog } from "../request-log";
import type { RouteApp } from "../route-types";
import { codeCalls } from "./calls-in-text";
import { registerEditorLiveRoutes } from "./editor-live-routes";
import { type CatalogEndpoint, endpointCatalog } from "./endpoint-catalog";
import { type EndpointDefinition, endpointDefinitions } from "./endpoint-definitions";
import { endpointStats } from "./endpoint-stats";
import { fileBoundCache } from "./file-bound-cache";
import { findingsCache } from "./findings-cache";
import { type GroupPlace, groupPlaces } from "./group-places";
import { matchCalls } from "./match-calls";
import { createSiteIndex } from "./site-index";

/** What the editor routes read. */
export interface EditorRouteDeps {
  project: Pick<ProjectReads, "snapshot">;
  requestLog: Pick<RequestLog, "events" | "keyEvents" | "version">;
  root: string;
  /** The sources the project declares and the runtimes attached, which Studio's audit reads */
  audit?: Pick<StudioAuditInputs, "declared" | "runtimes"> | undefined;
  /** The mocks Studio runs, which an editor's views list and switch */
  mocks?: StudioMocks | undefined;
}

/* A file an editor sends to be read: larger ones are generated, and hold no call worth a hint. */
const LARGEST_TEXT = 1024 * 1024;

/**
 * Mount the routes an editor reads Studio through, beside a call to an
 * endpoint and from Studio to the call:
 *
 * POST /api/editor/endpoints — how each endpoint's calls went: calls, failures, statuses, p50 and p95
 * POST /api/editor/calls — the endpoint calls in a file the editor sends (`{ file, text }`), each placed
 * POST /api/editor/findings — the findings of Studio's audit that concern endpoints, to place at their calls
 * POST /api/editor/definitions — where the project's files declare each endpoint
 * POST /api/editor/groups — where each group writes its endpoints, as an editor adds one
 * POST /api/editor/sites — where the project's code calls one endpoint (`{ source, endpoint }`)
 * and those of an editor's live views, the requests and the mocks: see `registerEditorLiveRoutes`
 *
 * They read and change nothing else, so they need no token: a process on
 * this machine reads them as the Studio page does.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project, its requests, its root, and what Studio's audit reads
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
    res.json({ endpoints: endpointStats(deps.requestLog.keyEvents(), catalog()) });
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

  const findings = deps.audit && findingsCache({ requestLog: deps.requestLog, ...deps.audit });
  app.post("/api/editor/findings", (_req, res) => {
    res.json({ findings: findings ? findings.read() : [] });
  });

  const definitions = fileBoundCache<EndpointDefinition[]>(deps.root);
  app.post("/api/editor/definitions", (_req, res) => {
    const running = deps.project.snapshot().running;
    res.json({
      definitions: running
        ? definitions.read(running, (modules) =>
            endpointDefinitions(deps.root, running.configFile, catalog(), modules),
          )
        : [],
    });
  });

  const groups = fileBoundCache<GroupPlace[]>(deps.root);
  app.post("/api/editor/groups", (_req, res) => {
    const running = deps.project.snapshot().running;
    res.json({
      groups: running
        ? groups.read(running, (modules) =>
            groupPlaces(deps.root, running.configFile, catalog(), modules),
          )
        : [],
    });
  });

  app.post("/api/editor/sites", async (req, res) => {
    const { source, endpoint } = isRecord(req.body) ? req.body : {};
    if (typeof source !== "string" || typeof endpoint !== "string") {
      res.status(400).json({ error: "Name the endpoint: { source, endpoint }." });
      return;
    }
    res.json({ sites: await sites.sitesOf(source, endpoint) });
  });

  registerEditorLiveRoutes(app, deps);
}
