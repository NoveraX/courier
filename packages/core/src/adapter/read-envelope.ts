import { createLogger } from "../logger";
import type { RequestPayloadInput } from "../utils/helpers";
import { reviveWithoutPrototypeKeys } from "../utils/safe-json";
import { discardBody } from "./discard-body";
import type { HandlerConfig } from "./handler-config";
import { LIMITS } from "./limits";
import { errorResponse } from "./parse";
import { type BoundedBody, readBoundedBody } from "./read-body";
import { parseWireOptionsJson } from "./wire-options";

const log = createLogger("Proxy");

/**
 * Read a proxy POST's envelope, spending a bounded amount of memory on it.
 *
 * The limit is chosen by media type before anything is read, because an
 * upload and a JSON envelope differ by orders of magnitude and one number
 * cannot be right for both. Parsing happens from the bytes already held, so
 * a body that passed the bound is never read twice.
 *
 * @param request - The proxy request
 * @param config - The handler's limits
 * @returns The envelope — parsed JSON or the multipart form — or the
 *   response that refuses it
 *
 * @example
 * ```ts
 * const envelope = await readEnvelope(request, config);
 * if (envelope instanceof Response) return envelope;
 * ```
 */
export async function readEnvelope(
  request: Request,
  config?: HandlerConfig,
): Promise<RequestPayloadInput | Response> {
  const contentType = request.headers.get("content-type") ?? "";
  /* Media types are case-insensitive (RFC 9110). */
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

  const isUpload = mediaType === "multipart/form-data";
  if (!isUpload && mediaType !== "application/json") {
    return refuse(request, 415, "Unsupported Content-Type");
  }

  const limit = isUpload
    ? (config?.maxUploadBytes ?? LIMITS.MAX_PROXY_UPLOAD_BYTES)
    : (config?.maxBodyBytes ?? LIMITS.MAX_PROXY_BODY_BYTES);

  const body = await readSent(request, limit);
  if (body instanceof Response) return body;
  if (!body.ok) return refuse(request, 413, `Request body exceeds ${body.limit} bytes`);

  return isUpload ? parseForm(body.bytes, contentType) : parseJson(body.bytes);
}

/**
 * Read the body the client sends, answering one it stopped sending.
 *
 * A browser that cancels an upload closes the connection mid-body, and the
 * read fails. That is the client's decision, not the server's failure: let
 * through, the rejection reached every framework's error handler and was
 * logged there with a stack, once per cancelled upload.
 */
async function readSent(request: Request, limit: number): Promise<BoundedBody | Response> {
  try {
    return await readBoundedBody(request, limit);
  } catch (error) {
    log.debug("The client stopped sending its request body", error);
    return errorResponse(400, "Request body could not be read");
  }
}

/**
 * Parse a multipart envelope, and hold its `_options` field to the rules the
 * JSON envelope and the GET `_o` parameter follow: an option a proxy client
 * may not set is refused, not dropped while the call runs anyway.
 */
async function parseForm(
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
): Promise<FormData | Response> {
  let form: FormData;
  try {
    /* Re-presenting the bytes lets the platform do the multipart parsing;
       the content type carries the boundary the parser needs. */
    form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch {
    return errorResponse(400, "Invalid multipart body");
  }

  for (const options of form.getAll("_options")) {
    if (typeof options !== "string") return errorResponse(400, "options must be a JSON string");
    const accepted = parseWireOptionsJson(options);
    if (!accepted.ok) return errorResponse(400, accepted.reason);
  }
  return form;
}

/**
 * Parse a JSON envelope with the hardening the GET path applies to `_v`: a
 * key that reaches `Object.prototype` never makes it into the variables or
 * the upstream body.
 */
function parseJson(bytes: Uint8Array<ArrayBuffer>): RequestPayloadInput | Response {
  try {
    return JSON.parse(new TextDecoder().decode(bytes), reviveWithoutPrototypeKeys);
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }
}

/** Answer a request without reading the rest of its body, and discard that rest. */
function refuse(request: Request, status: number, message: string): Response {
  discardBody(request);
  return errorResponse(status, message);
}
