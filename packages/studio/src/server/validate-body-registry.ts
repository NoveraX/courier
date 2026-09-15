/**
 * Runtime body validation guards for registry and update route handlers.
 */

import type { JsonResponse } from "./route-types";
import { isFileArray, isObject, isString, reject } from "./validate-body";

// ── Imports name (remove, check-updates) ────────────────────────────────────

interface NameBody {
  name: string;
  configPath?: string;
}

export function validateNameBody(body: unknown, res: JsonResponse): NameBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isString(body.name) || body.name.length === 0) return reject(res, "name");
  return { name: body.name, configPath: isString(body.configPath) ? body.configPath : undefined };
}

// ── Update preview ──────────────────────────────────────────────────────────

interface UpdatePreviewBody {
  name: string;
  newSpec: Record<string, unknown>;
  configPath?: string;
}

export function validateUpdatePreviewBody(
  body: unknown,
  res: JsonResponse,
): UpdatePreviewBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isString(body.name) || body.name.length === 0) return reject(res, "name");
  if (!isObject(body.newSpec)) return reject(res, "newSpec");
  return body as unknown as UpdatePreviewBody;
}

// ── Update apply ────────────────────────────────────────────────────────────

interface UpdateApplyBody {
  name: string;
  newSpec: Record<string, unknown>;
  files: { path: string; content: string }[];
  configPath?: string;
}

export function validateUpdateApplyBody(body: unknown, res: JsonResponse): UpdateApplyBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isString(body.name) || body.name.length === 0) return reject(res, "name");
  if (!isObject(body.newSpec)) return reject(res, "newSpec");
  if (!isFileArray(body.files)) return reject(res, "files");
  return body as unknown as UpdateApplyBody;
}
