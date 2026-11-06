import { LIMITS } from "../limits";
import type { StreamedUpload } from "../utils/streamed-upload";
import { BodyError } from "./body-error";
import { discardBody } from "./discard-body";
import { type EnvelopeResult, refusedBody } from "./envelope-result";
import type { HandlerConfig } from "./handler-config";
import { boundaryOf } from "./multipart/boundary-of";
import { diskStore } from "./multipart/disk-store";
import type { FileStore } from "./multipart/file-store";
import { memoryStore } from "./multipart/memory-store";
import { nodeDisk } from "./multipart/node-disk";
import { type FormLimits, readForm } from "./multipart/read-form";
import { readRecord } from "./multipart/read-record";
import { streamedForm } from "./multipart/streamed-form";
import { streamedRecord } from "./multipart/streamed-record";
import { UPLOAD_ROOM, UploadHold } from "./multipart/upload-hold";
import { requestBodyStream } from "./read-body";
import { parseWireOptionsJson } from "./wire-options";

/** An upload read as far as its call needs before it runs, and what lets go of it. */
interface HeldUpload {
  options: string | undefined;
  variables: FormData | Record<string, unknown> | StreamedUpload;
  release(): Promise<void>;
}

/**
 * Read a proxy upload — a `multipart/form-data` body, or a record upload — into
 * its envelope: the options the client wrote first, and the caller's upload.
 * A record upload's variables are the record its client sent, each file at
 * the place it held; a form's are the form.
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
 * together to `maxBodyBytes`, the limit a JSON call is held to; kept, it is
 * held besides to the room every upload of the process shares in memory and
 * on disk, and refused with 503 where it finds none left.
 *
 * @param request - The proxy request
 * @param contentType - Its `Content-Type`, which names the boundary
 * @param config - The handler's limits and how it holds uploads
 * @param record - Whether the body is a record upload, `multipart/vnd.courier.variables`
 * @param defaults - The fields such an upload sent on as it arrives is written with ahead of its own
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
  record = false,
  defaults?: Readonly<Record<string, unknown>>,
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
        ? await sentOn(body, boundary, limits, config, record, defaults)
        : await kept(body, boundary, limits, config, record);
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

/* Every file kept, for the call to read as often as it needs, out of the room every upload shares. */
async function kept(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  boundary: string,
  limits: FormLimits,
  config: HandlerConfig | undefined,
  record: boolean,
): Promise<HeldUpload> {
  const hold = holdFor(config);
  const store = storeFor(config, hold);
  try {
    if (record) {
      const read = await readRecord(body, boundary, limits, store, hold);
      return { options: read.options, variables: read.variables, release: () => store.release() };
    }
    const { options, form } = await readForm(body, boundary, limits, store, hold);
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
  config: HandlerConfig | undefined,
  record: boolean,
  defaults: Readonly<Record<string, unknown>> | undefined,
): Promise<HeldUpload> {
  /* A record's text is held while its form is sent on, so it is taken out of the room every
     upload shares, as a kept form's text is; a form's text goes on as it arrives. */
  const hold = record ? holdFor(config) : undefined;
  try {
    const { options, upload, stop } = record
      ? await streamedRecord(body, boundary, limits, defaults, hold)
      : await streamedForm(body, boundary, limits);
    return {
      options,
      variables: upload,
      release: async () => {
        try {
          if (!upload.locked) await stop();
        } finally {
          hold?.release();
        }
      },
    };
  } catch (error) {
    hold?.release();
    throw error;
  }
}

/* An upload's part of the room every upload of the process shares. */
function holdFor(config: HandlerConfig | undefined): UploadHold {
  return new UploadHold({
    memoryBytes: config?.totalUploadMemoryBytes ?? UPLOAD_ROOM.MEMORY_BYTES,
    diskBytes: config?.totalUploadDiskBytes ?? UPLOAD_ROOM.DISK_BYTES,
  });
}

/* On disk past its share of memory where the runtime has a disk and the handler allows it. */
function storeFor(config: HandlerConfig | undefined, hold: UploadHold): FileStore {
  const disk = config?.uploadMode === "memory" ? undefined : nodeDisk();
  if (disk === undefined) return memoryStore(LIMITS.UPLOAD_SLAB_BYTES, hold);
  return diskStore({
    hold,
    disk,
    directory: config?.uploadDirectory ?? disk.os.tmpdir(),
    memoryBytes: config?.uploadMemoryBytes ?? LIMITS.UPLOAD_MEMORY_BYTES,
    slabBytes: LIMITS.UPLOAD_SLAB_BYTES,
    staleAfterMs: config?.bodyTimeoutMs ?? LIMITS.BODY_TIMEOUT_MS,
  });
}
