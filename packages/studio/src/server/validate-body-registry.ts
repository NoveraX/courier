/**
 * Runtime body validation guards for registry and update route handlers.
 */

import type { ParsedSpec } from "../apis";
import type { PlanConsent } from "./import-files/run-plan";
import { isParsedSpec } from "./parsed-spec-guard";
import { readPlanConsent } from "./read-plan-consent";
import type { JsonResponse } from "./route-types";
import { isObject, isString, reject } from "./validate-body";

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
  newSpec: ParsedSpec;
}

export function validateUpdatePreviewBody(
  body: unknown,
  res: JsonResponse,
): UpdatePreviewBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isString(body.name) || body.name.length === 0) return reject(res, "name");
  if (!isParsedSpec(body.newSpec)) return reject(res, "newSpec");
  return { name: body.name, newSpec: body.newSpec };
}

// ── Update apply ────────────────────────────────────────────────────────────

interface UpdateApplyBody extends UpdatePreviewBody, PlanConsent {}

export function validateUpdateApplyBody(body: unknown, res: JsonResponse): UpdateApplyBody | null {
  const preview = validateUpdatePreviewBody(body, res);
  if (!preview || !isObject(body)) return null;
  const consent = readPlanConsent(body);
  if (!consent) return reject(res, "planDigest or confirm");
  return { ...preview, ...consent };
}
