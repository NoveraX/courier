import type { PlatformFetch } from "../../http-client/source-transport";
import type { UploadProgress } from "../../http-client/types";
import type { WebBody } from "../../http-client/web-types";

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
 * Send a request's body as a stream, as a page's bundle has it: never. A
 * browser's fetch reads a form or a `Blob` as it sends it, and a page
 * reports an upload's progress with XMLHttpRequest. A bundler that builds
 * for the browser takes this module in place of the one a server streams
 * its uploads with.
 *
 * @param _url - Where the request goes
 * @param _init - The request
 * @param _send - Progress, redirects and the fetch to send with
 * @returns Nothing: the body is handed to fetch as it is
 * @example
 * ```ts
 * sendStreamed(url, { method: "POST", body: form }, {}); // → undefined
 * ```
 */
export function sendStreamed(
  _url: string,
  _init: RequestInit & { method: string; body: WebBody },
  _send: StreamedSend,
): Promise<Response> | undefined {
  return undefined;
}
