import { logger } from "@noverax/courier";
import { discardBody } from "@noverax/courier/internal";
import type { Context as HonoContext } from "hono";

import { formFields } from "../form-fields";
import { createFaultError } from "../network/failure";
import type { UploadConditions } from "../types";
import { sizeLabel } from "../uploads/size-label";
import { oversizeRefusal, typeRefusal } from "../uploads/upload-refusals";
import { uploadedFiles } from "../uploads/uploaded-files";
import { bodyKindOf, type ParsedBody, parseBody } from "./body-kind";
import { BODY_LIMITS, type BodyLimits } from "./body-limits";
import { type PacedBody, readPaced } from "./paced-body";

/** How a request body is read: the mock's limits, the route's upload conditions, and whether its connection is lost partway. */
export interface BodyRules {
  limits: BodyLimits;
  uploads?: UploadConditions | undefined;
  /** Drop the connection once half the body has arrived: the `interrupt` fault. */
  interrupt?: boolean | undefined;
  /** Hears how much of the body has arrived, and how much its request declared. */
  onProgress?: ((received: number, declared: number | undefined) => void) | undefined;
}

/** Why a body was not taken: its status and the reason. A `dropped` one had its connection cut, so nothing answers it. */
export interface BodyRefusal {
  error: string;
  status: 400 | 413 | 415 | 502;
  dropped?: true | undefined;
}

/** A request body as the mock read it, or why it was not taken. */
export type RequestBody = ParsedBody | BodyRefusal;

/* The most of a body to take, and whether it is the upload limit the conditions set rather than the mock's own. */
interface Limit {
  bytes: number;
  simulated: boolean;
}

function limitOf(contentType: string, { limits, uploads }: BodyRules): Limit {
  if (bodyKindOf(contentType) === "json") return { bytes: limits.json, simulated: false };
  const taken = uploads?.maxBytes ?? Number.POSITIVE_INFINITY;
  return taken < limits.upload
    ? { bytes: taken, simulated: true }
    : { bytes: limits.upload, simulated: false };
}

function declaredSize(request: Request): number | undefined {
  const declared = Number(request.headers.get("content-length"));
  return request.headers.has("content-length") && Number.isFinite(declared) ? declared : undefined;
}

async function paced(c: HonoContext, limit: Limit, rules: BodyRules) {
  const declared = declaredSize(c.req.raw);
  try {
    return await readPaced(c.req.raw, {
      limit: limit.bytes,
      kbps: rules.uploads?.bandwidth ?? 0,
      cutAt: rules.interrupt ? Math.max(1, Math.ceil((declared ?? 0) / 2)) : undefined,
      onProgress: rules.onProgress && ((received) => rules.onProgress?.(received, declared)),
      signal: c.req.raw.signal,
    });
  } catch (error) {
    logger.debug("MockServer", `The client stopped sending ${c.req.method} ${c.req.path}`, error);
    return undefined;
  }
}

/* A body stopped at its limit is answered at once: the rest is taken off the connection unread, so a browser still sending it hears the answer. */
function stopped(
  request: Request,
  reason: Exclude<PacedBody, { ok: true }>["reason"],
  limit: Limit,
): BodyRefusal {
  if (reason === "cut") {
    return { error: createFaultError("interrupt").message, status: 502, dropped: true };
  }
  discardBody(request);
  if (limit.simulated) return oversizeRefusal(declaredSize(request), limit.bytes);
  return {
    error: `The request body is larger than ${sizeLabel(limit.bytes)}, the most this mock reads`,
    status: 413,
  };
}

function typeChecked(body: ParsedBody, accept: readonly string[] | undefined): RequestBody {
  if (!accept?.length || body.kind === "json") return body;
  const files = uploadedFiles(body.kind === "form" ? body.form : body.blob);
  return typeRefusal(files, accept) ?? body;
}

/**
 * Read a request body as a Courier server does: JSON up to 1 MB, a form or
 * an upload up to 10 MB — or the limits the mock was given — under the
 * upload conditions in force: no faster than their speed, no larger than
 * their size limit, holding no file of a type they do not take.
 *
 * A body over a limit is refused with 413 before it is all read, and the
 * rest taken off the connection; a file of a type not taken with 415; one
 * that does not parse, or whose client stopped sending it, with 400. One
 * cut off by the `interrupt` fault is refused as dropped. Raw bytes — a
 * file sent as the whole body — are read as a `Blob` of their type.
 *
 * @param c - The request's context
 * @param rules - The limits, the upload conditions, whether to cut the connection, who hears the progress
 * @returns The body, or why it was not taken
 * @example
 * ```ts
 * const body = await readRequestBody(c, { limits: config.bodyLimits });
 * if ("error" in body) return c.json({ error: body.error }, body.status);
 * ```
 */
export async function readRequestBody(
  c: HonoContext,
  rules: BodyRules = { limits: BODY_LIMITS },
): Promise<RequestBody> {
  const contentType = c.req.header("content-type") ?? "";
  const limit = limitOf(contentType, rules);
  const read = await paced(c, limit, rules);
  if (read === undefined) return { error: "The request body was not sent whole", status: 400 };
  if (!read.ok) return stopped(c.req.raw, read.reason, limit);
  const body = await parseBody(read.bytes, contentType, rules.limits.json);
  return "error" in body ? body : typeChecked(body, rules.uploads?.accept);
}

/**
 * The variables a body holds: its JSON, its form's fields as a record, or
 * its raw bytes as the `Blob` itself.
 *
 * @param body - A body the mock read
 * @returns Its value
 * @example
 * ```ts
 * const body = await readRequestBody(c);
 * if (!("error" in body)) handle(bodyValue(body));
 * ```
 */
export function bodyValue(body: ParsedBody): unknown {
  if (body.kind === "form") return formFields(body.form);
  return body.kind === "raw" ? body.blob : body.value;
}
