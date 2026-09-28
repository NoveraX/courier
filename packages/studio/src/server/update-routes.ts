/**
 * Express routes for update flow: preview and apply spec updates.
 */

import type { ApisRouteDeps } from "./apis-routes";
import { importsSnapshotOf } from "./imports-bridge";
import { withImportsLock } from "./imports-lock";
import { projectRootAt } from "./project-fs/project-root";
import { readDeclarations } from "./project-state/read-declarations";
import { sendRouteFailure } from "./route-failure";
import type { RouteApp } from "./route-types";
import { sendResult } from "./send-result";
import { handleApplyUpdate, handlePreviewUpdate } from "./update-helpers";
import { validateUpdateApplyBody, validateUpdatePreviewBody } from "./validate-body-registry";

/**
 * Mount the routes that preview and apply regenerating an import from a new
 * spec. The preview describes the config Studio runs; applying writes files
 * only while that config loads as it is on disk.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the routes read the import's declaration from
 *
 * @example
 * ```ts
 * registerUpdateFlowRoutes(app, { project, projectRoot: root });
 * ```
 */
export function registerUpdateFlowRoutes(app: RouteApp, deps: ApisRouteDeps): void {
  const { project, projectRoot } = deps;

  app.post("/api/apis/update/preview", async (req, res) => {
    try {
      const body = validateUpdatePreviewBody(req.body, res);
      if (!body) return;
      const declarations = await readDeclarations(project, projectRoot, "show");
      const result = await handlePreviewUpdate(
        body,
        importsSnapshotOf(declarations, projectRoot),
        projectRootAt(projectRoot),
      );
      sendResult(res, result);
    } catch (err) {
      sendRouteFailure(res, err, "Failed to preview update");
    }
  });

  app.post("/api/apis/update/apply", (req, res) => {
    const body = validateUpdateApplyBody(req.body, res);
    if (!body) return;

    /* Read once the lock is held: a request that waited behind a write acts on
       the declaration saved meanwhile. */
    void withImportsLock(async () => {
      const declarations = await readDeclarations(project, projectRoot, "act");
      const result = await handleApplyUpdate(
        body,
        importsSnapshotOf(declarations, projectRoot),
        projectRootAt(projectRoot),
      );
      if (!("error" in result)) project.importsChanged();
      return result;
    }).then(
      (result) => sendResult(res, result),
      (err: unknown) => sendRouteFailure(res, err, "Failed to apply update"),
    );
  });
}
