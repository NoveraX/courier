/**
 * Express routes for apis: parse, generate, write, diff.
 */

import { diffSpecs, generateCode, parseSpec } from "../apis";
import { resolveBaseURL } from "../apis/resolve-base-url";
import { DEMO_FILE_REFUSAL } from "./demo/demo-refusals";
import { fetchSpec, type SpecReach } from "./fetch-spec";
import { errMsg } from "./fs-helpers";
import { withImportExtension } from "./generated-import-extension";
import { registerLayoutRoute } from "./layout-route";
import { registerManageRoutes } from "./manage-routes";
import { formatProjectFiles } from "./project-format/format-project-files";
import { type ProjectRoot, projectRootAt } from "./project-fs/project-root";
import { readProjectText } from "./project-fs/read-project-text";
import type { ProjectState } from "./project-state/types";
import { refuseUnsendable } from "./refuse-unsendable";
import { registerRegistryRoutes } from "./registry-routes";
import { sendRouteFailure } from "./route-failure";
import type { RouteApp, RouteRequest } from "./route-types";
import { SpecFetchError } from "./spec-fetch-error";
import { type SpecHostAllowlist, specHostAllowlist } from "./spec-host-allowlist";
import { SpecHostsUnavailableError } from "./spec-hosts-unavailable-error";
import { SpecTooLargeError } from "./spec-too-large-error";
import { registerUpdateFlowRoutes } from "./update-routes";
import { validateDiffBody, validateGenerateBody, validateParseBody } from "./validate-body";
import { registerWriteRoutes } from "./write-routes";

/** What the imports routes read the project from. */
export interface ApisRouteDeps {
  /**
   * The project Studio runs: the routes read its import declarations, never
   * load their own, and announce each change they make to the imports state.
   * Removing an import takes it out of the config alone on its reload chain.
   */
  project: ProjectState;
  /** The project root, symlinks resolved: where the imports state lives. */
  projectRoot: string;
  /**
   * Whether a request comes from a visitor of a public demo, who may have
   * Studio read a specification from the public internet or as pasted,
   * never from this machine, its network, or a file of the project.
   */
  isDemoVisitor?: ((req: RouteRequest) => boolean) | undefined;
}

/**
 * Mount the API-import routes: parse, generate, write, diff, and the
 * imports list, checks, management and updates.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the imports routes answer from
 *
 * @example
 * ```ts
 * registerApisRoutes(app, { project, projectRoot: root });
 * ```
 */
export function registerApisRoutes(app: RouteApp, deps: ApisRouteDeps): void {
  app.post("/api/apis/parse", async (req, res) => {
    try {
      const body = validateParseBody(req.body, res);
      if (!body) return;
      const visitor = deps.isDemoVisitor?.(req) === true;
      if (visitor && body.source === "file") {
        res.status(403).json({ error: DEMO_FILE_REFUSAL, code: "STUDIO_DEMO_REFUSED" });
        return;
      }
      const raw = await resolveSpecContent(body, {
        allowlist: specHostAllowlist(deps.project, deps.projectRoot),
        root: projectRootAt(deps.projectRoot),
        reach: visitor ? "public" : "project",
      });
      const parsed = parseSpec(raw);
      const spec = body.source === "url" ? resolveBaseURL(parsed, body.content) : parsed;
      refuseUnsendable(spec);
      res.json(spec);
    } catch (err) {
      if (err instanceof SpecHostsUnavailableError || err instanceof SpecTooLargeError) {
        sendRouteFailure(res, err, "Failed to parse spec");
        return;
      }
      /* A spec host that could not be read is the server's failure, not the request's. */
      const status = err instanceof SpecFetchError && !err.refused ? 502 : 400;
      res.status(status).json({ error: errMsg(err, "Failed to parse spec") });
    }
  });

  app.post("/api/apis/generate", async (req, res) => {
    try {
      const body = validateGenerateBody(req.body, res);
      if (!body) return;
      const files = generateCode(body.spec, withImportExtension(body.options, deps.projectRoot));
      /* A demo's visitor writes nothing, and a formatter is a process per file. */
      if (deps.isDemoVisitor?.(req) === true) {
        res.json({ files });
        return;
      }
      /* Shown as they will be written: formatted as the project formats its code. */
      const {
        files: formatted,
        formattedWith,
        problem,
      } = await formatProjectFiles(deps.projectRoot, files);
      res.json({ files: formatted, formatting: { formattedWith, problem } });
    } catch (err) {
      res.status(400).json({ error: errMsg(err, "Code generation failed") });
    }
  });

  registerWriteRoutes(app, deps);
  registerLayoutRoute(app);

  app.post("/api/apis/diff", (req, res) => {
    try {
      const body = validateDiffBody(req.body, res);
      if (!body) return;
      res.json(diffSpecs(body.oldSpec, body.newSpec));
    } catch (err) {
      res.status(400).json({ error: errMsg(err, "Failed to diff specs") });
    }
  });

  registerRegistryRoutes(app, deps);
  registerManageRoutes(app, deps);
  registerUpdateFlowRoutes(app, deps);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveSpecContent(
  { source, content }: { source: "url" | "raw" | "file"; content: string },
  where: { allowlist: SpecHostAllowlist; root: ProjectRoot; reach: SpecReach },
): Promise<string> {
  if (source === "url") return fetchSpec(content, where.allowlist, {}, where.reach);
  if (source === "file") return readProjectText(where.root, content);
  return content;
}
