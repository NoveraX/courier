/**
 * Runtime body validation guards for apis route handlers.
 *
 * Each guard returns a typed body or null if validation fails.
 * Keeps validation at the system boundary — internal code can trust the shapes.
 */

import type { CourierImportAuth } from "@noverax/courier/config";

import type { GenerateOptions, ParsedSpec } from "../apis";
import { readGenerateOptions } from "./generate-options-guard";
import { ImportAuthError, readImportAuth } from "./import-auth";
import { isParsedSpec } from "./parsed-spec-guard";
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

const PARSE_SOURCES = ["url", "raw", "file", "import"] as const;

type ParseSource = (typeof PARSE_SOURCES)[number];

/**
 * What `POST /api/apis/parse` reads: a URL, the text itself, a file of the
 * project, or the specification of an import courier.config declares, by
 * its name.
 */
export interface ParseBody {
  source: ParseSource;
  /** The URL, the text, the file's path, or the import's name. */
  content: string;
  /** For a URL: what it is fetched with, each credential named by the environment variable that holds it. */
  auth?: CourierImportAuth | undefined;
}

/** A parse request as Studio reads it: a declared import is read as its URL. */
export type SpecRead = ParseBody & { source: Exclude<ParseSource, "import"> };

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
  if (body.auth === undefined) return { source: body.source, content: body.content };
  if (body.source !== "url") return reject(res, "auth");
  try {
    return { source: body.source, content: body.content, auth: readImportAuth(body.auth, true) };
  } catch (err) {
    if (!(err instanceof ImportAuthError)) throw err;
    res.status(400).json({ error: err.message, code: err.code });
    return null;
  }
}

// ── Generate route ──────────────────────────────────────────────────────────

interface GenerateBody {
  spec: ParsedSpec;
  options: GenerateOptions;
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
  if (!isParsedSpec(body.spec)) return reject(res, "spec");
  const options = readGenerateOptions(body.options);
  if (options === null) return reject(res, "options");
  return { spec: body.spec, options };
}

// ── Diff route ──────────────────────────────────────────────────────────────

interface DiffBody {
  oldSpec: ParsedSpec;
  newSpec: ParsedSpec;
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
  if (!isParsedSpec(body.oldSpec)) return reject(res, "oldSpec");
  if (!isParsedSpec(body.newSpec)) return reject(res, "newSpec");
  return { oldSpec: body.oldSpec, newSpec: body.newSpec };
}
