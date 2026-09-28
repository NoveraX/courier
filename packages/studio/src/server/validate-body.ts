/**
 * Runtime body validation guards for apis route handlers.
 *
 * Each guard returns a typed body or null if validation fails.
 * Keeps validation at the system boundary — internal code can trust the shapes.
 */

import type { JsonResponse } from "./route-types";

/**
 * Answer 400 naming the field that is missing or invalid.
 *
 * @param res - The response to answer on
 * @param field - The field Studio could not read
 * @returns `null`, for the validator to return
 * @example
 * ```ts
 * if (!isString(body.name)) return reject(res, "name");
 * ```
 */
export function reject(res: JsonResponse, field: string): null {
  res.status(400).json({ error: `Missing or invalid field: ${field}` });
  return null;
}

/** Whether a value is a JSON object: not `null`, not an array. */
export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Whether a value is a string. */
export function isString(v: unknown): v is string {
  return typeof v === "string";
}

// ── Parse route ──────────────────────────────────────────────────────────────

const PARSE_SOURCES = ["url", "raw", "file"] as const;

type ParseSource = (typeof PARSE_SOURCES)[number];

interface ParseBody {
  source: ParseSource;
  content: string;
}

function isParseSource(value: unknown): value is ParseSource {
  return PARSE_SOURCES.some((source) => source === value);
}

/**
 * The body of `POST /api/apis/parse`, or `null` once it answered 400.
 *
 * @param body - The request's body, as the JSON parser made it
 * @param res - The response a refusal is sent on
 * @returns Where the specification comes from and its URL, text or file name
 * @example
 * ```ts
 * const body = validateParseBody(req.body, res);
 * if (!body) return;
 * ```
 */
export function validateParseBody(body: unknown, res: JsonResponse): ParseBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isParseSource(body.source)) return reject(res, "source");
  if (!isString(body.content)) return reject(res, "content");
  return { source: body.source, content: body.content };
}

// ── Generate route ──────────────────────────────────────────────────────────

interface GenerateBody {
  spec: Record<string, unknown>;
  options: Record<string, unknown>;
}

/**
 * The body of `POST /api/apis/generate`, or `null` once it answered 400.
 *
 * @param body - The request's body, as the JSON parser made it
 * @param res - The response a refusal is sent on
 * @returns The parsed specification and the generator's options
 * @example
 * ```ts
 * const body = validateGenerateBody(req.body, res);
 * ```
 */
export function validateGenerateBody(body: unknown, res: JsonResponse): GenerateBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isObject(body.spec)) return reject(res, "spec");
  if (!isObject(body.options)) return reject(res, "options");
  return { spec: body.spec, options: body.options };
}

// ── Diff route ──────────────────────────────────────────────────────────────

interface DiffBody {
  oldSpec: Record<string, unknown>;
  newSpec: Record<string, unknown>;
}

/**
 * The body of `POST /api/apis/diff`, or `null` once it answered 400.
 *
 * @param body - The request's body, as the JSON parser made it
 * @param res - The response a refusal is sent on
 * @returns The two parsed specifications to compare
 * @example
 * ```ts
 * const body = validateDiffBody(req.body, res);
 * ```
 */
export function validateDiffBody(body: unknown, res: JsonResponse): DiffBody | null {
  if (!isObject(body)) return reject(res, "body");
  if (!isObject(body.oldSpec)) return reject(res, "oldSpec");
  if (!isObject(body.newSpec)) return reject(res, "newSpec");
  return { oldSpec: body.oldSpec, newSpec: body.newSpec };
}
