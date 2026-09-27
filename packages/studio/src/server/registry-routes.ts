/**
 * Express routes for removing an import. The write path lives in
 * `write-routes.ts`; checking for updates in `registry-update-routes.ts`.
 */

import type { ApisRouteDeps } from "./apis-routes";
import { summarizePlan } from "./import-files/plan-summary";
import { runPlan } from "./import-files/run-plan";
import { saveImportEntry } from "./import-files/save-import-entry";
import { importsSnapshotOf } from "./imports-bridge";
import { withImportsLock } from "./imports-lock";
import { projectRootAt } from "./project-fs/project-root";
import { readForRemoval } from "./project-state/read-for-removal";
import { readPlanConsent } from "./read-plan-consent";
import { registerUpdateRoutes } from "./registry-update-routes";
import { removalConfigNotes } from "./removal-config-notes";
import { planImportRemoval } from "./removal-plan";
import { sendRouteFailure } from "./route-failure";
import type { RouteApp } from "./route-types";
import { validateNameBody } from "./validate-body-registry";

/**
 * Mount the routes that preview and apply removing an import, and the
 * update checks. Removing works while courier.config does not load, since
 * it only undoes what Studio wrote: the preview says which files go, which
 * wait for the user and which stay; the removal applies that plan, as the
 * user allowed it, all at once, and forgets the import.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the routes answer from
 * @example
 * ```ts
 * registerRegistryRoutes(app, { project, projectRoot: root });
 * ```
 */
export function registerRegistryRoutes(app: RouteApp, deps: ApisRouteDeps): void {
  const { project, projectRoot } = deps;

  app.post("/api/apis/imports/remove/preview", async (req, res) => {
    const body = validateNameBody(req.body, res);
    if (!body) return;
    try {
      const { imports, running } = await readForRemoval(project, projectRoot);
      const planned = planImportRemoval(
        projectRootAt(projectRoot),
        body.name,
        importsSnapshotOf(imports, projectRoot),
      );
      if ("error" in planned) {
        res.status(planned.status).json({ error: planned.error });
        return;
      }
      /* The preview warns about every file the removal may take, those waiting for consent too. */
      const mayTake = [
        ...planned.removals,
        ...planned.pending.flatMap((step) => step.removal ?? []),
      ];
      const notes = removalConfigNotes(
        projectRoot,
        body.name,
        running,
        mayTake.map((removal) => removal.path),
      );
      res.json({ plan: summarizePlan(planned), ...notes });
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
    try {
      /* Read once the lock is held: a request that waited behind a write answers
         for the declaration saved meanwhile, and removes the files that write recorded. */
      const reply = await withImportsLock(async () => {
        const { imports, running } = await readForRemoval(project, projectRoot);
        const root = projectRootAt(projectRoot);
        const planned = planImportRemoval(root, body.name, importsSnapshotOf(imports, projectRoot));
        if ("error" in planned) return { status: planned.status, body: { error: planned.error } };
        const report = runPlan(
          root,
          planned,
          consent,
          (_applied, applyId) => saveImportEntry(root.path, body.name, null, applyId),
          "required",
        );
        project.importsChanged();
        const { removed, kept, backupDir } = report;
        const notes = removalConfigNotes(projectRoot, body.name, running, removed);
        return { status: 200, body: { success: true, removed, kept, backupDir, ...notes } };
      });
      res.status(reply.status).json(reply.body);
    } catch (err) {
      sendRouteFailure(res, err, "Failed to remove the import");
    }
  });

  registerUpdateRoutes(app, deps);
}
