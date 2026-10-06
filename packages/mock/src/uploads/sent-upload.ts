import type { UploadConditions } from "../types";
import { oversizeRefusal, typeRefusal, type UploadRefusal } from "./upload-refusals";
import { uploadedFiles } from "./uploaded-files";

/* What a call sent in process carries as an upload: a form, or raw bytes. JSON is none. */
function rawSize(sent: unknown): number | undefined {
  if (sent instanceof Blob) return sent.size;
  if (sent instanceof ArrayBuffer || ArrayBuffer.isView(sent)) return sent.byteLength;
  if (sent instanceof URLSearchParams) return new TextEncoder().encode(sent.toString()).byteLength;
  return undefined;
}

/**
 * The refusal a mock server gives an upload over its size limit, for one
 * sent to a mock client in process: the size is the body's as it would
 * travel — a form encoded as multipart, raw bytes as they are.
 *
 * @param sent - What the call was made with
 * @param uploads - The upload conditions in force for its endpoint
 * @returns The 413 and why, or `undefined` when the upload is taken or is none
 * @example
 * ```ts
 * await oversizeOfSent(form, { maxBytes: 1_048_576 }); // { status: 413, error: "The upload is 3.2 MB, …" }
 * ```
 */
export async function oversizeOfSent(
  sent: unknown,
  uploads: UploadConditions | undefined,
): Promise<UploadRefusal | undefined> {
  if (uploads?.maxBytes === undefined) return undefined;
  const size = sent instanceof FormData ? (await new Response(sent).blob()).size : rawSize(sent);
  if (size === undefined || size <= uploads.maxBytes) return undefined;
  return oversizeRefusal(size, uploads.maxBytes);
}

/**
 * The refusal a mock server gives an upload holding a file of a type it
 * does not take, for one sent to a mock client in process. Raw bytes with
 * no type are a file of no type.
 *
 * @param sent - What the call was made with
 * @param uploads - The upload conditions in force for its endpoint
 * @returns The 415 and why, or `undefined` when every file is taken or there is none
 * @example
 * ```ts
 * typeOfSent(form, { accept: ["image/*"] }); // { status: 415, error: "notes.txt (text/plain) is not …" }
 * ```
 */
export function typeOfSent(
  sent: unknown,
  uploads: UploadConditions | undefined,
): UploadRefusal | undefined {
  const accept = uploads?.accept;
  if (!accept?.length) return undefined;
  if (sent instanceof FormData || sent instanceof Blob) {
    return typeRefusal(uploadedFiles(sent), accept);
  }
  if (sent instanceof ArrayBuffer || ArrayBuffer.isView(sent)) {
    return typeRefusal([{ name: "", type: "", size: sent.byteLength }], accept);
  }
  return undefined;
}
