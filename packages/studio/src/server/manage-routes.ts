/**
 * Express routes for endpoint management (inventory, preview, apply).
 */

import type { ParsedSpec } from "../apis";
import type { ApisRouteDeps } from "./apis-routes";
import { importsSnapshotOf } from "./imports-bridge";
import { withImportsLock } from "./imports-lock";
import { handleManageApply } from "./manage-apply";
import { handleInventory, handleManagePreview } from "./manage-helpers";
import { readDeclarations } from "./project-state/read-declarations";
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
    sendResult(res, handleInventory(body, importsSnapshotOf(declarations, projectRoot)));
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
    sendResult(res, handleManagePreview(body, importsSnapshotOf(declarations, projectRoot)));
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

  /* Read once the lock is held: a request that waited behind a write acts on
     the declaration saved meanwhile. */
  void withImportsLock(async () => {
    const declarations = await readDeclarations(project, projectRoot, "act");
    return handleManageApply(body, importsSnapshotOf(declarations, projectRoot));
  }).then(
    (result) => sendResult(res, result),
    (err: unknown) => sendRouteFailure(res, err, "Failed to apply changes"),
  );
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateInventoryBody(
  body: unknown,
  res: JsonResponse,
): { name: string; newSpec?: ParsedSpec; configPath?: string } | null {
  if (!isObject(body)) {
    res.status(400).json({ error: "Invalid body" });
    return null;
  }
  if (!isString(body.name)) {
    res.status(400).json({ error: "Missing name" });
    return null;
  }
  return {
    name: body.name,
    newSpec: body.newSpec as ParsedSpec | undefined,
    configPath: isString(body.configPath) ? body.configPath : undefined,
  };
}

function validateManageBody(
  body: unknown,
  res: JsonResponse,
): {
  name: string;
  spec: ParsedSpec;
  toAdd: Record<string, string[]>;
  toRemove: Record<string, string[]>;
  configPath?: string;
} | null {
  if (!isObject(body)) {
    res.status(400).json({ error: "Invalid body" });
    return null;
  }
  if (!isString(body.name)) {
    res.status(400).json({ error: "Missing name" });
    return null;
  }
  if (!isObject(body.spec)) {
    res.status(400).json({ error: "Missing spec" });
    return null;
  }
  return {
    name: body.name,
    spec: body.spec as unknown as ParsedSpec,
    toAdd: (isObject(body.toAdd) ? body.toAdd : {}) as Record<string, string[]>,
    toRemove: (isObject(body.toRemove) ? body.toRemove : {}) as Record<string, string[]>,
    configPath: isString(body.configPath) ? body.configPath : undefined,
  };
}
