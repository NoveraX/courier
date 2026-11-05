/**
 * An upload the proxy sends on as it arrives: the call's variables when the
 * handler's `uploadMode` is `"stream"`.
 *
 * It is a `ReadableStream` of the multipart body the upstream receives — the
 * caller's fields and files, re-encoded under a boundary of the proxy's own,
 * the call's options left out — and it is read once, as the upstream reads
 * it: the client's upload goes no faster than that. `type` is its content
 * type, which names the boundary. Nothing of it is held: a schema or a
 * middleware that reads it reads it in the upstream's place, and a retry,
 * which would send it again, takes it for what it is — a stream, a body it
 * cannot send twice. `isStreamedUpload` tells one apart.
 */
export interface StreamedUpload extends ReadableStream<Uint8Array<ArrayBuffer>> {
  /** The body's content type, `multipart/form-data` with its boundary */
  readonly type: string;
}

/** What hands out a streamed upload's bytes, a piece each time one is asked for. */
export interface StreamedUploadSource {
  /** Enqueue the next piece, or close the stream after the last */
  pull(controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>): void | Promise<void>;
  /** Stop: whoever reads the upload wants no more of it */
  cancel?(): void | Promise<void>;
}

/* The uploads made here: a stream is one only when this module made it. */
const UPLOADS = new WeakSet<object>();

/**
 * Make a streamed upload of the bytes `source` hands out, each read only as
 * it is asked for.
 *
 * A stream made here, not a subclass of `ReadableStream`: a module that
 * extended the class would fail to load where the runtime has no streams,
 * as React Native has none, and every entry of the package with it.
 *
 * @param type - The body's content type, with its boundary
 * @param source - What hands out its bytes
 * @returns The upload
 *
 * @example
 * ```ts
 * const upload = streamedUpload(`multipart/form-data; boundary=${boundary}`, source);
 * ```
 */
export function streamedUpload(type: string, source: StreamedUploadSource): StreamedUpload {
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(source, { highWaterMark: 0 });
  const upload = Object.assign(stream, { type });
  UPLOADS.add(upload);
  return upload;
}

/**
 * Whether a value is an upload the proxy sends on as it arrives.
 *
 * @param value - A call's variables, or a request's body
 * @returns `true` for a `StreamedUpload`
 *
 * @example
 * ```ts
 * if (isStreamedUpload(ctx.variables)) ctx.headers.set("x-upload", "streamed");
 * ```
 */
export function isStreamedUpload(value: unknown): value is StreamedUpload {
  return typeof value === "object" && value !== null && UPLOADS.has(value);
}
