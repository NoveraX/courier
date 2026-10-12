import { createLogger } from "../logger";
import { discardBody } from "./discard-body";
import type { HandlerConfig } from "./handler-config";
import { LIMITS } from "./limits";
import {
  type Envelope,
  type ParsedEnvelope,
  parseFormEnvelope,
  parseJsonEnvelope,
} from "./parse-envelope";
import { type BoundedBody, readBoundedBody } from "./read-body";

const log = createLogger("Proxy");

/** A proxy POST's envelope, or the status and message that refuse it. */
export type EnvelopeResult =
  | { ok: true; envelope: Envelope }
  | { ok: false; status: number; message: string };

/**
 * Read a proxy POST's envelope, spending a bounded amount of memory on it.
 *
 * The limit is chosen by media type before anything is read, because an
 * upload and a JSON envelope differ by orders of magnitude and one number
 * cannot be right for both. Parsing happens from the bytes already held, so
 * a body that passed the bound is never read twice. The rest of a refused
 * body is taken off the connection, so the refusal reaches the client.
 *
 * @param request - The proxy request
 * @param config - The handler's limits
 * @returns The envelope, or why it is refused
 *
 * @example
 * ```ts
 * const read = await readEnvelope(request, config);
 * if (!read.ok) return errorResponse(read.status, read.message);
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
    return refuse(request, 415, "Unsupported Content-Type");
  }

  const limit = isUpload
    ? (config?.maxUploadBytes ?? LIMITS.MAX_PROXY_UPLOAD_BYTES)
    : (config?.maxBodyBytes ?? LIMITS.MAX_PROXY_BODY_BYTES);

  const body = await readSent(request, limit);
  if (!body) return { ok: false, status: 400, message: "Request body could not be read" };
  if (!body.ok) return refuse(request, 413, `Request body exceeds ${body.limit} bytes`);

  const parsed = isUpload
    ? await parseForm(body.bytes, contentType)
    : parseJsonEnvelope(body.bytes);
  return parsed.ok ? parsed : { ok: false, status: 400, message: parsed.reason };
}

/**
 * Read the body the client sends, or nothing when it could not be read.
 *
 * A browser that cancels an upload closes the connection mid-body, and the
 * read fails. That is the client's decision, not the server's failure: let
 * through, the rejection reached every framework's error handler and was
 * logged there with a stack, once per cancelled upload. A read that fails
 * while the client is still there — a framework's own body limit, a broken
 * chunked encoding — is worth a warning, since the answer alone says little.
 */
async function readSent(request: Request, limit: number): Promise<BoundedBody | undefined> {
  try {
    return await readBoundedBody(request, limit);
  } catch (error) {
    if (clientLeft(request, error)) {
      log.debug("The client stopped sending its request body", error);
    } else {
      log.warn("Could not read the request body", error);
    }
    return undefined;
  }
}

/* What a read fails with when the connection went from under it; Windows
   names one it aborted ECONNABORTED. */
const CONNECTION_GONE: ReadonlySet<unknown> = new Set(["ECONNRESET", "ECONNABORTED"]);

/**
 * Whether a failed read means the client went away: the request's signal
 * says so, or the connection went from under it.
 */
function clientLeft(request: Request, error: unknown): boolean {
  if (request.signal.aborted) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    CONNECTION_GONE.has(error.code)
  );
}

/** Parse a multipart body into its envelope. */
async function parseForm(
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
): Promise<ParsedEnvelope> {
  let form: FormData;
  try {
    /* Re-presenting the bytes lets the platform do the multipart parsing;
       the content type carries the boundary the parser needs. */
    form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch {
    return { ok: false, reason: "Invalid multipart body" };
  }
  return parseFormEnvelope(form);
}

/** Refuse a request without reading the rest of its body, and discard that rest. */
function refuse(request: Request, status: number, message: string): EnvelopeResult {
  discardBody(request);
  return { ok: false, status, message };
}
