import { logger } from "@noverax/courier";
import { readBoundedBody } from "@noverax/courier/internal";
import type { Context as HonoContext } from "hono";

import { formFields } from "../form-fields";

/** The most of a request body the mock reads: JSON, and a form or an upload. */
export interface BodyLimits {
  json: number;
  upload: number;
}

/** A Courier server's limits: 1 MB of JSON, 10 MB of form or upload. */
export const BODY_LIMITS: BodyLimits = { json: 1_048_576, upload: 10_485_760 };

/**
 * The limits a mock was given, each one left out a Courier server's.
 *
 * @param options - The mock's options
 * @returns Its limits
 * @example
 * ```ts
 * bodyLimitsOf({ maxUploadBytes: 50_000_000 }); // { json: 1_048_576, upload: 50_000_000 }
 * ```
 */
export function bodyLimitsOf(
  options: { maxBodyBytes?: number | undefined; maxUploadBytes?: number | undefined } | undefined,
): BodyLimits {
  return {
    json: options?.maxBodyBytes ?? BODY_LIMITS.json,
    upload: options?.maxUploadBytes ?? BODY_LIMITS.upload,
  };
}

/** A request body as the mock read it, or why it could not. */
export type RequestBody =
  | { kind: "json"; value: unknown }
  | { kind: "form"; form: FormData }
  | { error: string; status: 400 | 413 };

const FORM_TYPES = new Set(["multipart/form-data", "application/x-www-form-urlencoded"]);

/* A limit as people say it: in megabytes from one up, in kilobytes below. */
const sizeOf = (bytes: number): string =>
  bytes >= 1_048_576
    ? `${Number((bytes / 1_048_576).toFixed(1))} MB`
    : `${Number((bytes / 1024).toFixed(1))} KB`;

async function bounded(c: HonoContext, limit: number) {
  try {
    return await readBoundedBody(c.req.raw, limit);
  } catch (error) {
    logger.debug("MockServer", `The client stopped sending ${c.req.method} ${c.req.path}`, error);
    return undefined;
  }
}

async function formOf(
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
): Promise<FormData | undefined> {
  try {
    /* The platform parses the form; the content type carries a multipart boundary. */
    return await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch (error) {
    logger.debug("MockServer", "A form body could not be parsed", error);
    return undefined;
  }
}

/**
 * Read a request body as a Courier server does: JSON up to 1 MB, a form or
 * an upload up to 10 MB — or the limits the mock was given. A body over its
 * limit is refused with 413 before it is all read, one that does not parse
 * with 400, and one whose client stopped sending it with 400. A body with
 * no content type is read as JSON.
 *
 * @param c - The request's context
 * @param limits - The most of a body to read
 * @returns The body as JSON or a form, or why it could not be read
 * @example
 * ```ts
 * const body = await readRequestBody(c, config.bodyLimits);
 * if ("error" in body) return c.json({ error: body.error }, body.status);
 * ```
 */
export async function readRequestBody(
  c: HonoContext,
  limits: BodyLimits = BODY_LIMITS,
): Promise<RequestBody> {
  const contentType = c.req.header("content-type") ?? "";
  const isForm = FORM_TYPES.has(contentType.split(";")[0]?.trim().toLowerCase() ?? "");
  const limit = isForm ? limits.upload : limits.json;
  const read = await bounded(c, limit);
  if (read === undefined) return { error: "The request body was not sent whole", status: 400 };
  if (!read.ok) {
    return {
      error: `The request body is larger than ${sizeOf(limit)}, the most this mock reads`,
      status: 413,
    };
  }
  if (isForm) {
    const form = await formOf(read.bytes, contentType);
    return form
      ? { kind: "form", form }
      : { error: "The form body could not be read", status: 400 };
  }
  const text = new TextDecoder().decode(read.bytes);
  if (text.trim() === "") return { kind: "json", value: undefined };
  try {
    return { kind: "json", value: JSON.parse(text) };
  } catch (error) {
    logger.debug("MockServer", `Unparseable body on ${c.req.method} ${c.req.path}`, error);
    return { error: "The request body is not valid JSON", status: 400 };
  }
}

/**
 * The variables a body holds: its JSON, or its form's fields as a record.
 *
 * @param body - A body the mock read
 * @returns Its value
 * @example
 * ```ts
 * const body = await readRequestBody(c);
 * if (!("error" in body)) handle(bodyValue(body));
 * ```
 */
export function bodyValue(body: Exclude<RequestBody, { error: string }>): unknown {
  return body.kind === "form" ? formFields(body.form) : body.value;
}
