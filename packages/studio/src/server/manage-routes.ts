/**
 * Express routes for endpoint management (inventory, preview, apply).
 */

import type { ParsedSpec } from "../apis";
import type { ApisRouteDeps } from "./apis-routes";
import { summarizePlan } from "./import-files/plan-summary";
import { importsSnapshotOf } from "./imports-bridge";
import { withImportsLock } from "./imports-lock";
import { handleManageApply } from "./manage-apply";
import { handleInventory } from "./manage-helpers";
import { type ManageRequest, planManage } from "./manage-plan";
import { isParsedSpec } from "./parsed-spec-guard";
import { projectRootAt } from "./project-fs/project-root";
import { readDeclarations } from "./project-state/read-declarations";
import { readPlanConsent } from "./read-plan-consent";
import { sendRouteFailure } from "./route-failure";
import type { JsonResponse, RouteApp } from "./route-types";
import { sendResult } from "./send-result";
import { isObject, isString } from "./validate-body";

type RouteRequest = { body: Record<string, unknown> };

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
    sendResult(
      res,
      handleInventory(
        body,
        importsSnapshotOf(declarations, projectRoot),
        projectRootAt(projectRoot),
      ),
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
    const planned = planManage(
      body,
      importsSnapshotOf(declarations, projectRoot),
      projectRootAt(projectRoot),
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
    const result = handleManageApply({ ...body, ...consent }, imports, projectRootAt(projectRoot));
    if (!("error" in result)) project.importsChanged();
    return result;
  }).then(
    (result) => sendResult(res, result),
    (err: unknown) => sendRouteFailure(res, err, "Failed to apply changes"),
  );
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateInventoryBody(
  body: unknown,
  res: JsonResponse,
): { name: string; newSpec?: ParsedSpec } | null {
  if (!isObject(body) || !isString(body.name)) {
    res.status(400).json({ error: "Expected { name, newSpec? }" });
    return null;
  }
  if (body.newSpec !== undefined && !isParsedSpec(body.newSpec)) {
    res.status(400).json({ error: "newSpec is not a spec as Studio parsed it" });
    return null;
  }
  return { name: body.name, ...(body.newSpec !== undefined && { newSpec: body.newSpec }) };
}

function validateManageBody(body: unknown, res: JsonResponse): ManageRequest | null {
  if (!isObject(body) || !isString(body.name) || !isParsedSpec(body.spec)) {
    res.status(400).json({
      error: "Expected { name, spec, toAdd?, toRemove? } with the spec as Studio parsed it",
    });
    return null;
  }
  const toAdd = readGroups(body.toAdd);
  const toRemove = readGroups(body.toRemove);
  if (toAdd === null || toRemove === null) {
    res.status(400).json({ error: "toAdd and toRemove list endpoint names by group" });
    return null;
  }
  return { name: body.name, spec: body.spec, toAdd, toRemove };
}

function readGroups(value: unknown): Record<string, string[]> | null {
  if (value === undefined) return {};
  if (!isObject(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every((entry): entry is [string, string[]] => isNames(entry[1]))) return null;
  /* fromEntries defines each key as its own, so a group named "__proto__" stays a group. */
  return Object.fromEntries(entries);
}

function isNames(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((name) => typeof name === "string");
}
