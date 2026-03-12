/**
 * Runtime body validation guards for codegen route handlers.
 *
 * Each guard returns a typed body or null if validation fails.
 * Keeps validation at the system boundary — internal code can trust the shapes.
 */

import type { JsonResponse } from "./route-types";

/** Send 400 with error message and return null to signal early exit */
export function reject(res: JsonResponse, field: string): null {
  res.status(400).json({ error: `Missing or invalid field: ${field}` });
  return null;
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isString(v: unknown): v is string {
  return typeof v === "string";
}

export function isFileArray(v: unknown): v is { path: string; content: string }[] {
  if (!Array.isArray(v)) return false;
  return v.every((f) => isObject(f) && isString(f.path) && isString(f.content));
}

// ── Parse route ──────────────────────────────────────────────────────────────

const VALID_SOURCES = new Set(["url", "raw", "file"]);

interface ParseBody {
  source: "url" | "raw" | "file";
  content: string;
}

export function validateParseBody(body: unknown, res: JsonResponse): ParseBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isString(body.source) || !VALID_SOURCES.has(body.source)) return reject(res, "source");
  if (!isString(body.content)) return reject(res, "content");
  return { source: body.source as ParseBody["source"], content: body.content };
}

// ── Generate route ──────────────────────────────────────────────────────────

interface GenerateBody {
  spec: Record<string, unknown>;
  options: Record<string, unknown>;
}

export function validateGenerateBody(body: unknown, res: JsonResponse): GenerateBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isObject(body.spec)) return reject(res, "spec");
  if (!isObject(body.options)) return reject(res, "options");
  return { spec: body.spec, options: body.options } as GenerateBody;
}

// ── Diff route ──────────────────────────────────────────────────────────────

interface DiffBody {
  oldSpec: Record<string, unknown>;
  newSpec: Record<string, unknown>;
}

export function validateDiffBody(body: unknown, res: JsonResponse): DiffBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isObject(body.oldSpec)) return reject(res, "oldSpec");
  if (!isObject(body.newSpec)) return reject(res, "newSpec");
  return { oldSpec: body.oldSpec, newSpec: body.newSpec } as DiffBody;
}

// ── Fingerprint route ───────────────────────────────────────────────────────

interface FingerprintBody {
  files: { path: string; content: string }[];
}

export function validateFingerprintBody(body: unknown, res: JsonResponse): FingerprintBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isFileArray(body.files)) return reject(res, "files");
  return { files: body.files };
}

// ── Merge route ─────────────────────────────────────────────────────────────

interface MergeBody {
  existing: string;
  generated: string;
  fingerprints: Record<string, string>;
}

export function validateMergeBody(body: unknown, res: JsonResponse): MergeBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isString(body.existing)) return reject(res, "existing");
  if (!isString(body.generated)) return reject(res, "generated");
  if (!isObject(body.fingerprints)) return reject(res, "fingerprints");
  return body as unknown as MergeBody;
}

// ── Write route ─────────────────────────────────────────────────────────────

interface WriteBodyValidated {
  files: { path: string; content: string }[];
  sourceName?: string;
  spec?: Record<string, unknown>;
  specUrl?: string;
  importType?: string;
  options?: Record<string, unknown>;
}

export function validateWriteBody(body: unknown, res: JsonResponse): WriteBodyValidated | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isFileArray(body.files)) return reject(res, "files");
  return body as unknown as WriteBodyValidated;
}
