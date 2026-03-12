/**
 * Runtime body validation guards for registry and update route handlers.
 */

import type { JsonResponse } from "./route-types";
import { isFileArray, isObject, isString, reject } from "./validate-body";

// ── Registry add ────────────────────────────────────────────────────────────

interface RegistryAddBody {
  name: string;
  spec: Record<string, unknown>;
  specUrl: string;
  options: Record<string, unknown>;
  generatedFiles: { path: string; content: string }[];
  importType?: string;
  configPath?: string;
}

export function validateRegistryAddBody(body: unknown, res: JsonResponse): RegistryAddBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isString(body.name) || body.name.length === 0) return reject(res, "name");
  if (!isObject(body.spec)) return reject(res, "spec");
  if (!isString(body.specUrl)) return reject(res, "specUrl");
  if (!isObject(body.options)) return reject(res, "options");
  if (!isFileArray(body.generatedFiles)) return reject(res, "generatedFiles");
  return body as unknown as RegistryAddBody;
}

// ── Registry name (remove, check-updates) ───────────────────────────────────

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
