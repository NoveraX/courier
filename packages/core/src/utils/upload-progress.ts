import type { PlatformFetch } from "../http-client/source-transport";
import type { UploadProgress } from "../http-client/types";
import type { WebBody } from "../http-client/web-types";
import { sendStreamed } from "./send-streamed";
import { type XhrRequestInit, xhrRequest } from "./xhr-request";

/**
 * Send a request, reporting its body's progress.
 *
 * In a browser or a React Native app that is XMLHttpRequest, whose upload
 * events fetch lacks. Elsewhere the body is streamed to fetch without being
 * read into memory first, and reported as fetch takes each chunk.
 *
 * @param url - Where to send it
 * @param init - The request, as it would be given to fetch; its body is set
 * @param onProgress - Called as the body is sent
 * @param options - `withinOrigin`: redirects are followed on the request's origin alone;
 *   `fetch`: what sends it in place of the platform's `fetch`
 * @returns The answer
 */
export async function sendWithUploadProgress(
  url: string,
  init: XhrRequestInit & { body: WebBody },
  onProgress: (progress: UploadProgress) => void,
  {
    withinOrigin = false,
    fetch: send,
  }: { withinOrigin?: boolean; fetch?: PlatformFetch | undefined } = {},
): Promise<Response> {
  if (typeof XMLHttpRequest !== "undefined") return xhrRequest(url, init, onProgress);

  const request = { ...(init as RequestInit), method: init.method, body: init.body };
  /* A page's service worker has no XMLHttpRequest either, and sends the body uncounted. */
  return (
    sendStreamed(url, request, { onProgress, withinOrigin, fetch: send }) ??
    (send ?? fetch)(url, request)
  );
}
