import { BodyError } from "./body-error";
import { discardBody } from "./discard-body";
import { type EnvelopeResult, refusedBody } from "./envelope-result";
import type { HandlerConfig } from "./handler-config";
import { LIMITS } from "./limits";
import { boundaryOf } from "./multipart/boundary-of";
import { memoryStore } from "./multipart/memory-store";
import { readForm } from "./multipart/read-form";
import { requestBodyStream } from "./read-body";
import { parseWireOptionsJson } from "./wire-options";

/**
 * Read a proxy upload — a `multipart/form-data` body — into its envelope:
 * the options the client wrote first, and the caller's form.
 *
 * The body is parsed as it arrives, never held whole before it is: each
 * file is kept once, as the part that carried it ends, and a body that
 * breaks a limit or does not parse is refused at the part where it does,
 * the rest of it taken off the connection unread. The upload as a whole is
 * held to `maxUploadBytes`, its text fields together to `maxBodyBytes`, the
 * limit a JSON call is held to.
 *
 * @param request - The proxy request
 * @param contentType - Its `Content-Type`, which names the boundary
 * @param config - The handler's limits
 * @returns The envelope, or why it is refused
 *
 * @example
 * ```ts
 * if (mediaType === "multipart/form-data") return readUpload(request, contentType, config);
 * ```
 */
export async function readUpload(
  request: Request,
  contentType: string,
  config: HandlerConfig | undefined,
): Promise<EnvelopeResult> {
  let boundary: string;
  try {
    boundary = boundaryOf(contentType);
  } catch (error) {
    discardBody(request);
    if (error instanceof BodyError) return refusedBody(error);
    throw error;
  }

  const body = requestBodyStream(request, {
    maxBytes: config?.maxUploadBytes ?? LIMITS.MAX_PROXY_UPLOAD_BYTES,
  });
  let read: Awaited<ReturnType<typeof readForm>>;
  try {
    read = await readForm(
      body,
      boundary,
      {
        maxParts: LIMITS.MAX_UPLOAD_PARTS,
        maxHeaderBytes: LIMITS.MAX_PART_HEADER_BYTES,
        maxFieldBytes: config?.maxBodyBytes ?? LIMITS.MAX_PROXY_BODY_BYTES,
      },
      memoryStore(LIMITS.UPLOAD_SLAB_BYTES),
    );
  } catch (error) {
    if (error instanceof BodyError) return refusedBody(error);
    throw error;
  }

  const accepted = parseWireOptionsJson(read.options ?? null);
  if (!accepted.ok) return { ok: false, status: 400, message: accepted.reason };
  return { ok: true, envelope: { variables: read.form, options: accepted.options } };
}
