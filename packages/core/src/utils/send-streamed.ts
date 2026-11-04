import type { PlatformFetch } from "../http-client/source-transport";
import type { UploadProgress } from "../http-client/types";
import type { WebBody } from "../http-client/web-types";
import { countedStream } from "./counted-stream";
import { FETCH_KEEPS_FORMS } from "./fetch-keeps-forms";
import { sendAsStream } from "./send-as-stream";

/** How a body sent as a stream is sent. */
export interface StreamedSend {
  /** Hears each chunk once fetch has taken it */
  onProgress?: ((progress: UploadProgress) => void) | undefined;
  /** Redirects are followed on the request's origin alone */
  withinOrigin?: boolean | undefined;
  /** What sends it in place of the platform's `fetch` */
  fetch?: PlatformFetch | undefined;
}

/**
 * Send a request's body as the stream of its bytes, where a server should.
 *
 * A server has no XMLHttpRequest, so an upload whose progress is asked for
 * is streamed and counted as fetch takes it. A form or a `Blob` is streamed
 * too where the platform's fetch would keep a copy of it for as long as it
 * sends it, as Node's does. Code a page never runs: a bundler that builds
 * for the browser takes a stand-in that sends nothing.
 *
 * @param url - Where to send it
 * @param init - The request as fetch would take it; its body is set
 * @param send - Progress, redirects and the fetch to send with
 * @returns The answer, or `undefined` when the body is best handed to fetch as it is
 *
 * @example
 * ```ts
 * const streamed = sendStreamed(url, { ...init, body: form }, { withinOrigin: true });
 * if (streamed) return streamed;
 * ```
 */
export function sendStreamed(
  url: string,
  init: RequestInit & { method: string; body: WebBody },
  { onProgress, withinOrigin, fetch }: StreamedSend,
): Promise<Response> | undefined {
  const options = { withinOrigin, fetch };
  if (onProgress) {
    return sendAsStream(
      url,
      init,
      (stream, size) => countedStream(stream, size, onProgress, init.signal),
      options,
    );
  }
  if (FETCH_KEEPS_FORMS && (init.body instanceof FormData || init.body instanceof Blob)) {
    return sendAsStream(url, init, (stream) => stream, options);
  }
  return undefined;
}
