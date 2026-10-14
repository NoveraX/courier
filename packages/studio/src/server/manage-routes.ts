/**
 * Express routes for endpoint management (inventory, preview, apply).
 */

import { projectRootAt } from "@noverax/courier-cli/devkit";
import type { ApisRouteDeps } from "./apis-routes";
import { summarizePlan } from "./import-files/plan-summary";
import { getImportEntry, importsSnapshotOf } from "./imports-bridge";
import { withImportsLock } from "./imports-lock";
import { handleManageApply } from "./manage-apply";
import { validateInventoryBody, validateManageBody } from "./manage-body";
import { handleInventory } from "./manage-helpers";
import { planManage } from "./manage-plan";
import { readDeclarations } from "./project-state/read-declarations";
import { readPlanConsent } from "./read-plan-consent";
import { sendRouteFailure } from "./route-failure";
import type { JsonResponse, RouteApp } from "./route-types";
import { sendResult } from "./send-result";
import { declaredSpec } from "./spec-as-declared";

type RouteRequest = { body: unknown };

/**
 * Mount the routes that list, preview and apply adding and removing endpoints
 * of an import. The inventory and the preview describe the config Studio runs;
 * applying writes files only while that config loads as it is on disk.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the routes read the import's declaration from
 *
 * @example
 * ```ts
 * registerManageRoutes(app, { project, projectRoot: root });
 * ```
 */
export function registerManageRoutes(app: RouteApp, deps: ApisRouteDeps): void {
  app.post("/api/apis/manage/inventory", (req, res) => handleInventoryRoute(req, res, deps));
  app.post("/api/apis/manage/preview", (req, res) => handlePreviewRoute(req, res, deps));
  app.post("/api/apis/manage/apply", (req, res) => handleApplyRoute(req, res, deps));
}

async function handleInventoryRoute(
  req: RouteRequest,
  res: JsonResponse,
  { project, projectRoot }: ApisRouteDeps,
): Promise<void> {
  try {
    const body = validateInventoryBody(req.body, res);
    if (!body) return;

    const declarations = await readDeclarations(project, projectRoot, "show");
    const imports = importsSnapshotOf(declarations, projectRoot);
    const entry = getImportEntry(imports, body.name);
    const declared = body.newSpec && (await declaredSpec(entry, body.name, body.newSpec));
    const request = { name: body.name, ...(declared && { newSpec: declared.spec }) };
    sendResult(
      res,
      handleInventory(request, imports, projectRootAt(projectRoot), declared?.specHash),
    );
  } catch (err) {
    sendRouteFailure(res, err, "Failed to build inventory");
  }
}

async function handlePreviewRoute(
  req: RouteRequest,
  res: JsonResponse,
  { project, projectRoot }: ApisRouteDeps,
): Promise<void> {
  try {
    const body = validateManageBody(req.body, res);
    if (!body) return;

    const declarations = await readDeclarations(project, projectRoot, "show");
    const imports = importsSnapshotOf(declarations, projectRoot);
    const entry = getImportEntry(imports, body.name);
    const request = { ...body, ...(await declaredSpec(entry, body.name, body.spec)) };
    const planned = await planManage(
      request,
      imports,
      projectRootAt(projectRoot),
      project.snapshot().running,
    );
    if ("error" in planned) {
      sendResult(res, planned);
      return;
    }
    const { addResult, removeResult, plan } = planned;
    res.json({ addResult, removeResult, plan: summarizePlan(plan) });
  } catch (err) {
    sendRouteFailure(res, err, "Failed to preview changes");
  }
}

function handleApplyRoute(
  req: RouteRequest,
  res: JsonResponse,
  { project, projectRoot }: ApisRouteDeps,
): void {
  const body = validateManageBody(req.body, res);
  if (!body) return;
  const consent = readPlanConsent(req.body);
  if (!consent) {
    res.status(400).json({ error: "planDigest must be a string and confirm a list of paths" });
    return;
  }

  /* Read once the lock is held: a request that waited behind a write acts on
     the declaration saved meanwhile. */
  void withImportsLock(async () => {
    const declarations = await readDeclarations(project, projectRoot, "act");
    const imports = importsSnapshotOf(declarations, projectRoot);
    const declared = await declaredSpec(getImportEntry(imports, body.name), body.name, body.spec);
    const request = { ...body, ...declared, ...consent };
    const result = await handleManageApply(
      request,
      imports,
      projectRootAt(projectRoot),
      project.snapshot().running,
    );
    if (!("error" in result)) project.importsChanged();
    return result;
  }).then(
    (result) => sendResult(res, result),
    (err: unknown) => sendRouteFailure(res, err, "Failed to apply changes"),
  );
}
