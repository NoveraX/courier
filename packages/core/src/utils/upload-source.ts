/**
 * A request body as something that can be streamed — again, if a redirect
 * asks for it — and whose size is known before it is sent.
 */

import { encodeMultipart } from "./multipart-body";

const TEXT = new TextEncoder();

export interface UploadSource {
  /** Bytes in the body; 0 when it is a stream that does not say. */
  size: number;
  /** The content type the body implies, when the caller names none. */
  contentType: string | null;
  /** Whether `open` may be called more than once. */
  replayable: boolean;
  /** Stream the body from its start. */
  open(): ReadableStream<Uint8Array>;
}

/**
 * Describe a body for an upload that reports its progress.
 *
 * Nothing is read here: a Blob or a FormData's files are read as they are
 * sent, and bytes already in memory are sent from where they are.
 *
 * @param body - The request body
 * @returns Its size, implied content type, and a way to stream it
 *
 * @example
 * ```ts
 * const source = toUploadSource(form);
 * source.size; // bytes the multipart body will take
 * ```
 */
export function toUploadSource(body: BodyInit): UploadSource {
  if (body instanceof ReadableStream) {
    return { size: 0, contentType: null, replayable: false, open: () => body };
  }
  if (body instanceof FormData) {
    const { blob, contentType } = encodeMultipart(body);
    return fromBlob(blob, contentType);
  }
  if (body instanceof Blob) return fromBlob(body, body.type || null);
  if (typeof body === "string") return fromBytes(TEXT.encode(body), "text/plain;charset=UTF-8");
  if (body instanceof URLSearchParams) {
    return fromBytes(
      TEXT.encode(body.toString()),
      "application/x-www-form-urlencoded;charset=UTF-8",
    );
  }
  const bytes = ArrayBuffer.isView(body)
    ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    : new Uint8Array(body);
  return fromBytes(bytes, null);
}

function fromBlob(blob: Blob, contentType: string | null): UploadSource {
  return { size: blob.size, contentType, replayable: true, open: () => blob.stream() };
}

function fromBytes(bytes: Uint8Array, contentType: string | null): UploadSource {
  return {
    size: bytes.byteLength,
    contentType,
    replayable: true,
    open: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
  };
}
