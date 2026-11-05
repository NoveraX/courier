import type { PlatformFetch } from "../http-client/source-transport";
import type { WebBody } from "../http-client/web-types";
import { sendUpload } from "./upload-redirects";
import { toUploadSource } from "./upload-source";

/**
 * Send a request's body as the stream of its bytes, read only as it is sent.
 *
 * A form's encoding chose its boundary, so its content type is the
 * encoding's, whatever the caller set — as a `StreamedUpload`'s is its own;
 * a `Blob`'s is its own unless the caller named one. A body whose size is
 * known is sent with its `Content-Length`, as the platform would have sent it.
 *
 * @param url - Where to send it
 * @param init - The request as fetch would take it; its body is set
 * @param wrap - Turns a stream of the body into the one sent, e.g. to count it
 * @param options - `withinOrigin`: redirects are followed on the request's
 *   origin alone; `fetch`: what sends it in place of the platform's `fetch`
 * @returns The answer
 *
 * @example
 * ```ts
 * await sendAsStream(url, { method: "POST", body: form }, (stream) => stream);
 * ```
 */
export function sendAsStream(
  url: string,
  init: RequestInit & { method: string; body: WebBody },
  wrap: (stream: ReadableStream<Uint8Array>, size: number) => ReadableStream<Uint8Array>,
  {
    withinOrigin = false,
    fetch: send,
  }: { withinOrigin?: boolean | undefined; fetch?: PlatformFetch | undefined } = {},
): Promise<Response> {
  const source = toUploadSource(init.body);
  const headers = new Headers(init.headers);
  if (source.contentType && (source.framed || !headers.has("content-type"))) {
    headers.set("content-type", source.contentType);
  }
  if (source.replayable) headers.set("content-length", String(source.size));

  return sendUpload(url, { ...init, headers }, source, (stream) => wrap(stream, source.size), {
    withinOrigin,
    fetch: send,
  });
}
