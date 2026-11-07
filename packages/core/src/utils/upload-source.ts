/**
 * A request body as something that can be streamed — again, if a redirect
 * asks for it — and whose size is known before it is sent.
 */

import type { WebBody } from "../http-client/web-types";
import { encodeMultipart } from "./multipart-body";
import { isStreamedUpload } from "./streamed-upload";

/* Made when first needed, so an engine without TextEncoder still loads the client. */
let textEncoder: TextEncoder | undefined;

function encodeText(text: string): Uint8Array {
  textEncoder ??= new TextEncoder();
  return textEncoder.encode(text);
}

export interface UploadSource {
  /** Bytes in the body; 0 when it is a stream that does not say. */
  size: number;
  /** The content type the body implies, when the caller names none. */
  contentType: string | null;
  /**
   * Whether that is the only content type it can be sent with, whatever the
   * caller named: it names the boundary the body's parts are framed by.
   */
  framed: boolean;
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
export function toUploadSource(body: WebBody): UploadSource {
  if (isStreamedUpload(body)) {
    return { size: 0, contentType: body.type, framed: true, replayable: false, open: () => body };
  }
  if (body instanceof ReadableStream) {
    return { size: 0, contentType: null, framed: false, replayable: false, open: () => body };
  }
  if (body instanceof FormData) {
    const { blob, contentType } = encodeMultipart(body);
    return { ...fromBlob(blob, contentType), framed: true };
  }
  if (body instanceof Blob) return fromBlob(body, body.type || null);
  if (typeof body === "string") return fromBytes(encodeText(body), "text/plain;charset=UTF-8");
  if (body instanceof URLSearchParams) {
    return fromBytes(
      encodeText(body.toString()),
      "application/x-www-form-urlencoded;charset=UTF-8",
    );
  }
  const bytes = ArrayBuffer.isView(body)
    ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    : new Uint8Array(body);
  return fromBytes(bytes, null);
}

function fromBlob(blob: Blob, contentType: string | null): UploadSource {
  return {
    size: blob.size,
    contentType,
    framed: false,
    replayable: true,
    open: () => blob.stream(),
  };
}

function fromBytes(bytes: Uint8Array, contentType: string | null): UploadSource {
  return {
    size: bytes.byteLength,
    contentType,
    framed: false,
    replayable: true,
    open: () =>
      new ReadableStream<Uint8Array>({
        __proto__: null,
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      } as UnderlyingDefaultSource<Uint8Array>),
  };
}
