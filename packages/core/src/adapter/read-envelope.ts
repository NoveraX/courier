import { RECORD_UPLOAD_TYPE } from "../utils/record-upload";
import { discardBody } from "./discard-body";
import { type EnvelopeResult, refusedBody } from "./envelope-result";
import type { HandlerConfig } from "./handler-config";
import { LIMITS } from "./limits";
import { parseJsonEnvelope } from "./parse-envelope";
import { readBodyText } from "./read-body-text";
import { readUpload } from "./read-upload";

export type { EnvelopeResult } from "./envelope-result";

/**
 * Read a proxy POST's envelope, spending a bounded amount of memory and time
 * on it.
 *
 * The limit is chosen by media type before anything is read, because an
 * upload and a JSON envelope differ by orders of magnitude and one number
 * cannot be right for both. A body shorter than its `Content-Length` is
 * refused with 413 `BODY_INCOMPLETE` rather than parsed: it is not the body
 * the client sent. The rest of a refused body is taken off the connection,
 * so the refusal reaches the client.
 *
 * @param request - The proxy request
 * @param config - The handler's limits
 * @param defaults - The fields a record upload sent on as it arrives is written with ahead of its own
 * @returns The envelope, or why it is refused
 *
 * @example
 * ```ts
 * const read = await readEnvelope(request, config);
 * if (!read.ok) return errorResponse(read.status, read.message, read.code);
 * ```
 */
export async function readEnvelope(
  request: Request,
  config?: HandlerConfig,
  defaults?: Readonly<Record<string, unknown>>,
): Promise<EnvelopeResult> {
  const contentType = request.headers.get("content-type") ?? "";
  /* Media types are case-insensitive (RFC 9110). */
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

  if (mediaType === "multipart/form-data") return readUpload(request, contentType, config);
  if (mediaType === RECORD_UPLOAD_TYPE) {
    return readUpload(request, contentType, config, true, defaults);
  }
  if (mediaType !== "application/json") {
    discardBody(request);
    return { ok: false, status: 415, message: "Unsupported Content-Type" };
  }

  const body = await readBodyText(request, {
    maxBytes: config?.maxBodyBytes ?? LIMITS.MAX_PROXY_BODY_BYTES,
    idleTimeoutMs: config?.bodyIdleTimeoutMs,
    timeoutMs: config?.bodyTimeoutMs,
  });
  if (!body.ok) return refusedBody(body.error);
  const parsed = parseJsonEnvelope(body.text);
  return parsed.ok ? parsed : { ok: false, status: 400, message: parsed.reason };
}
