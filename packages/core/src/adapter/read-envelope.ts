import { createLogger } from "../logger";
import { BodyError } from "./body-error";
import { discardBody } from "./discard-body";
import type { HandlerConfig } from "./handler-config";
import { LIMITS } from "./limits";
import { type Envelope, parseFormEnvelope, parseJsonEnvelope } from "./parse-envelope";
import { type BodyLimits, requestBodyStream } from "./read-body";
import { readBodyText } from "./read-body-text";

const log = createLogger("Proxy");

/** A proxy POST's envelope, or the status, message and code that refuse it. */
export type EnvelopeResult =
  | { ok: true; envelope: Envelope }
  | { ok: false; status: number; message: string; code?: string | undefined };

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
): Promise<EnvelopeResult> {
  const contentType = request.headers.get("content-type") ?? "";
  /* Media types are case-insensitive (RFC 9110). */
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

  const isUpload = mediaType === "multipart/form-data";
  if (!isUpload && mediaType !== "application/json") {
    discardBody(request);
    return { ok: false, status: 415, message: "Unsupported Content-Type" };
  }

  if (isUpload) {
    return readForm(request, contentType, {
      maxBytes: config?.maxUploadBytes ?? LIMITS.MAX_PROXY_UPLOAD_BYTES,
    });
  }
  const body = await readBodyText(request, {
    maxBytes: config?.maxBodyBytes ?? LIMITS.MAX_PROXY_BODY_BYTES,
  });
  if (!body.ok) return refused(body.error);
  const parsed = parseJsonEnvelope(body.text);
  return parsed.ok ? parsed : { ok: false, status: 400, message: parsed.reason };
}

/** Read a multipart body into its envelope. */
async function readForm(
  request: Request,
  contentType: string,
  limits: BodyLimits,
): Promise<EnvelopeResult> {
  let form: FormData;
  try {
    /* The content type carries the boundary the platform's parser needs. */
    form = await new Response(requestBodyStream(request, limits), {
      headers: { "content-type": contentType },
    }).formData();
  } catch (error) {
    if (error instanceof BodyError) return refused(error);
    log.debug("A multipart body did not parse", error);
    return { ok: false, status: 400, message: "Invalid multipart body" };
  }
  const parsed = parseFormEnvelope(form);
  return parsed.ok ? parsed : { ok: false, status: 400, message: parsed.reason };
}

/**
 * The answer to a body that was not taken, told once in the log.
 *
 * A browser that cancels an upload closes the connection mid-body. That is
 * the client's decision, not the server's failure, and stays at debug level;
 * so do refusals of what the client sent. A read that fails while the
 * client is still there, and a body something cut short, say little in the
 * answer alone and are warned of.
 */
function refused(error: BodyError): EnvelopeResult {
  if (error.code === "BODY_UNREADABLE") log.warn(error.message, error.cause);
  else if (error.code === "BODY_INCOMPLETE") log.warn(`${error.code}: ${error.message}`);
  else log.debug(`${error.code}: ${error.message}`);
  return { ok: false, status: error.status, message: error.message, code: error.code };
}
