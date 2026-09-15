/**
 * Express routes for endpoint management (inventory, preview, apply).
 */

import type { ParsedSpec } from "../apis";
import { withImportsLock } from "./imports-lock";
import { handleManageApply } from "./manage-apply";
import { handleInventory, handleManagePreview } from "./manage-helpers";
import { errMsg } from "./registry-helpers";
import type { JsonResponse, RouteApp } from "./route-types";
import { isObject, isString } from "./validate-body";

export function registerManageRoutes(app: RouteApp): void {
  app.post("/api/apis/manage/inventory", handleInventoryRoute);
  app.post("/api/apis/manage/preview", handlePreviewRoute);
  app.post("/api/apis/manage/apply", handleApplyRoute);
}

async function handleInventoryRoute(
  req: { body: Record<string, unknown> },
  res: JsonResponse,
): Promise<void> {
  try {
    const body = validateInventoryBody(req.body, res);
    if (!body) return;

    const result = await handleInventory(body);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: errMsg(err, "Failed to build inventory") });
  }
}

async function handlePreviewRoute(
  req: { body: Record<string, unknown> },
  res: JsonResponse,
): Promise<void> {
  try {
    const body = validateManageBody(req.body, res);
    if (!body) return;

    const result = await handleManagePreview(body);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: errMsg(err, "Failed to preview changes") });
  }
}

function handleApplyRoute(req: { body: Record<string, unknown> }, res: JsonResponse): void {
  const body = validateManageBody(req.body, res);
  if (!body) return;

  void withImportsLock(async () => {
    const result = await handleManageApply(body);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  }).catch((err) => {
    res.status(500).json({ error: errMsg(err, "Failed to apply changes") });
  });
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
