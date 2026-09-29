/**
 * Express routes for apis: parse, generate, write, diff.
 */

import { diffSpecs, generateCode, parseSpec } from "../apis";
import { fetchSpec } from "./fetch-spec";
import { errMsg } from "./fs-helpers";
import { withImportExtension } from "./generated-import-extension";
import { registerLayoutRoute } from "./layout-route";
import { registerManageRoutes } from "./manage-routes";
import { type ProjectRoot, projectRootAt } from "./project-fs/project-root";
import { readProjectText } from "./project-fs/read-project-text";
import type { ProjectImports } from "./project-state/types";
import { refuseUnsendable } from "./refuse-unsendable";
import { registerRegistryRoutes } from "./registry-routes";
import { sendRouteFailure } from "./route-failure";
import type { RouteApp } from "./route-types";
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
   */
  project: ProjectImports;
  /** The project root, symlinks resolved: where the imports state lives. */
  projectRoot: string;
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
      const allowlist = specHostAllowlist(deps.project, deps.projectRoot);
      const raw = await resolveSpecContent(
        body.source,
        body.content,
        allowlist,
        projectRootAt(deps.projectRoot),
      );
      const spec = parseSpec(raw);
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

  app.post("/api/apis/generate", (req, res) => {
    try {
      const body = validateGenerateBody(req.body, res);
      if (!body) return;
      res.json({
        files: generateCode(body.spec, withImportExtension(body.options, deps.projectRoot)),
      });
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
  source: "url" | "raw" | "file",
  content: string,
  allowlist: SpecHostAllowlist,
  root: ProjectRoot,
): Promise<string> {
  if (source === "url") return fetchSpec(content, allowlist);
  if (source === "file") {
    return readProjectText(root, content);
  }
  return content;
}
