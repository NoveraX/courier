import type { StreamedUpload } from "../utils/streamed-upload";
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
import { type FormLimits, readForm } from "./multipart/read-form";
import { streamedForm } from "./multipart/streamed-form";
import { requestBodyStream } from "./read-body";
import { parseWireOptionsJson } from "./wire-options";

/** An upload read as far as its call needs before it runs, and what lets go of it. */
interface HeldUpload {
  options: string | undefined;
  variables: FormData | StreamedUpload;
  release(): Promise<void>;
}

/**
 * Read a proxy upload — a `multipart/form-data` body — into its envelope:
 * the options the client wrote first, and the caller's upload.
 *
 * The body is parsed as it arrives, never held whole before it is. Kept,
 * each file is held once, as the part that carried it ends — in memory, or
 * past the upload's share of memory on disk — and the call's variables are
 * a `FormData`; sent on (`uploadMode: "stream"`), nothing is held and they
 * are a `StreamedUpload`, read once, by the upstream. A body that breaks a
 * limit or does not parse before the call runs is refused at the part where
 * it does, its files let go and the rest of it taken off the connection
 * unread; one that does so as it is sent on fails the call with its refusal.
 * The upload as a whole is held to `maxUploadBytes`, its text fields
 * together to `maxBodyBytes`, the limit a JSON call is held to.
 *
 * @param request - The proxy request
 * @param contentType - Its `Content-Type`, which names the boundary
 * @param config - The handler's limits and how it holds uploads
 * @returns The envelope and the `release` that lets go of what the upload
 *   holds, or why it is refused
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
  const limits: FormLimits = {
    maxParts: config?.maxUploadParts ?? LIMITS.MAX_UPLOAD_PARTS,
    maxHeaderBytes: LIMITS.MAX_PART_HEADER_BYTES,
    maxFieldBytes: config?.maxBodyBytes ?? LIMITS.MAX_PROXY_BODY_BYTES,
  };
  let upload: HeldUpload;
  try {
    upload =
      config?.uploadMode === "stream"
        ? await sentOn(body, boundary, limits)
        : await kept(body, boundary, limits, storeFor(config));
  } catch (error) {
    if (error instanceof BodyError) return refusedBody(error);
    throw error;
  }

  const accepted = parseWireOptionsJson(upload.options ?? null);
  if (!accepted.ok) {
    await upload.release();
    return { ok: false, status: 400, message: accepted.reason };
  }
  return {
    ok: true,
    envelope: { variables: upload.variables, options: accepted.options },
    release: upload.release,
  };
}

/* Every file kept by `store`, for the call to read as often as it needs. */
async function kept(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  boundary: string,
  limits: FormLimits,
  store: FileStore,
): Promise<HeldUpload> {
  try {
    const { options, form } = await readForm(body, boundary, limits, store);
    return { options, variables: form, release: () => store.release() };
  } catch (error) {
    await store.release();
    throw error;
  }
}

/* Nothing kept: past its options, the upload is read as the upstream takes it. Once the call
   has its answer, an upload a fetch is still sending is the fetch's to end — it reads it to its
   end, or cancels it once the answer is read, as Node's does — so an upstream that answers as
   it reads loses neither; one nothing sends is stopped, the rest of its body taken off. */
async function sentOn(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  boundary: string,
  limits: FormLimits,
): Promise<HeldUpload> {
  const { options, upload, stop } = await streamedForm(body, boundary, limits);
  return {
    options,
    variables: upload,
    release: async () => {
      if (!upload.locked) await stop();
    },
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
