import { BodyError } from "./body-error";
import { discardBody } from "./discard-body";
import { type EnvelopeResult, refusedBody } from "./envelope-result";
import type { HandlerConfig } from "./handler-config";
import { LIMITS } from "./limits";
import { boundaryOf } from "./multipart/boundary-of";
import { diskStore } from "./multipart/disk-store";
import type { FileStore } from "./multipart/file-store";
import { memoryStore } from "./multipart/memory-store";
import { nodeDisk } from "./multipart/node-disk";
import { type ReadForm, readForm } from "./multipart/read-form";
import { requestBodyStream } from "./read-body";
import { parseWireOptionsJson } from "./wire-options";

/**
 * Read a proxy upload — a `multipart/form-data` body — into its envelope:
 * the options the client wrote first, and the caller's form.
 *
 * The body is parsed as it arrives, never held whole before it is: each
 * file is kept once, as the part that carried it ends — in memory, or past
 * the upload's share of memory on disk (see `uploadMode`) — and a body that
 * breaks a limit or does not parse is refused at the part where it does, its
 * files let go and the rest of it taken off the connection unread. The
 * upload as a whole is held to `maxUploadBytes`, its text fields together to
 * `maxBodyBytes`, the limit a JSON call is held to.
 *
 * @param request - The proxy request
 * @param contentType - Its `Content-Type`, which names the boundary
 * @param config - The handler's limits and where it keeps uploads
 * @returns The envelope and the `release` that lets its files go, or why it is refused
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
    idleTimeoutMs: config?.bodyIdleTimeoutMs,
    timeoutMs: config?.bodyTimeoutMs,
  });
  const store = storeFor(config);
  let read: ReadForm;
  try {
    read = await readForm(
      body,
      boundary,
      {
        maxParts: config?.maxUploadParts ?? LIMITS.MAX_UPLOAD_PARTS,
        maxHeaderBytes: LIMITS.MAX_PART_HEADER_BYTES,
        maxFieldBytes: config?.maxBodyBytes ?? LIMITS.MAX_PROXY_BODY_BYTES,
      },
      store,
    );
  } catch (error) {
    await store.release();
    if (error instanceof BodyError) return refusedBody(error);
    throw error;
  }

  const accepted = parseWireOptionsJson(read.options ?? null);
  if (!accepted.ok) {
    await store.release();
    return { ok: false, status: 400, message: accepted.reason };
  }
  return {
    ok: true,
    envelope: { variables: read.form, options: accepted.options },
    release: () => store.release(),
  };
}

/* On disk past its share of memory where the runtime has a disk and the handler allows it. */
function storeFor(config: HandlerConfig | undefined): FileStore {
  const disk = config?.uploadMode === "memory" ? undefined : nodeDisk();
  if (disk === undefined) return memoryStore(LIMITS.UPLOAD_SLAB_BYTES);
  return diskStore({
    disk,
    directory: config?.uploadDirectory ?? disk.os.tmpdir(),
    memoryBytes: config?.uploadMemoryBytes ?? LIMITS.UPLOAD_MEMORY_BYTES,
    slabBytes: LIMITS.UPLOAD_SLAB_BYTES,
  });
}
