/**
 * Express routes for removing an import. The write path lives in
 * `write-routes.ts`; checking for updates in `registry-update-routes.ts`.
 */

import type { ApisRouteApp, ApisRouteDeps } from "./apis-routes";
import { applyImportRemoval } from "./import-removal/apply-import-removal";
import { previewImportRemoval } from "./import-removal/preview-import-removal";
import { isLocalBrowser } from "./is-local-browser";
import { isRecord } from "./mocks-edit/is-record";
import { readPlanConsent } from "./read-plan-consent";
import { registerUpdateRoutes } from "./registry-update-routes";
import { sendRouteFailure } from "./route-failure";
import { validateNameBody } from "./validate-body-registry";

const NOT_LOCAL =
  "Studio changes courier.config only for a browser on this machine. Remove the import without changing the config, or open Studio on the machine it runs on.";

/**
 * Mount the routes that preview and apply removing an import, and the
 * update checks. Removing works while courier.config does not load, since
 * it only undoes what Studio wrote: the preview says which files go, which
 * wait for the user and which stay, and the change that takes the import
 * out of the config; the removal applies that plan, as the user allowed it,
 * all at once — the config first, when the user asked for it — and forgets
 * the import.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the routes answer from
 * @example
 * ```ts
 * registerRegistryRoutes(app, { project, projectRoot: root });
 * ```
 */
export function registerRegistryRoutes(app: ApisRouteApp, deps: ApisRouteDeps): void {
  app.post("/api/apis/imports/remove/preview", async (req, res) => {
    const body = validateNameBody(req.body, res);
    if (!body) return;
    try {
      const preview = await previewImportRemoval(deps, body.name, isLocalBrowser(req));
      if ("error" in preview) res.status(preview.status).json({ error: preview.error });
      else res.json(preview);
    } catch (err) {
      sendRouteFailure(res, err, "Failed to preview removing the import");
    }
  });

  app.post("/api/apis/imports/remove", async (req, res) => {
    const body = validateNameBody(req.body, res);
    const consent = body ? readPlanConsent(req.body) : null;
    if (!body) return;
    if (!consent) {
      res.status(400).json({ error: "planDigest must be a string and confirm a list of paths" });
      return;
    }
    const configBaseHash = isRecord(req.body) ? req.body.configBaseHash : undefined;
    if (configBaseHash !== undefined && typeof configBaseHash !== "string") {
      res
        .status(400)
        .json({ error: "configBaseHash must be the baseHash of the config change shown" });
      return;
    }
    if (configBaseHash !== undefined && !isLocalBrowser(req)) {
      res.status(403).json({ error: NOT_LOCAL });
      return;
    }
    try {
      const report = await applyImportRemoval(deps, body.name, consent, configBaseHash);
      if ("error" in report) res.status(report.status).json({ error: report.error });
      else res.json(report);
    } catch (err) {
      sendRouteFailure(res, err, "Failed to remove the import");
    }
  });

  registerUpdateRoutes(app, deps);
}
