/**
 * Send a streamed upload, following redirects the way fetch would.
 *
 * Fetch cannot replay a body it was given as a stream, so a 307 or 308 —
 * which keeps the method and the body — failed an upload with progress that
 * succeeded without it. The body here can be streamed again, so redirects are
 * followed by hand, applying the steps of the Fetch standard's redirect
 * handling: at most 20 hops, a POST that a 301, 302 or 303 turns into a GET
 * without its body, and no credentials carried to another origin.
 */

import type { UploadSource } from "./upload-source";

const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20;
const BODY_HEADERS = ["content-encoding", "content-language", "content-location", "content-type"];
const CREDENTIAL_HEADERS = ["authorization", "proxy-authorization", "cookie"];

interface Hop {
  url: string;
  method: string;
  headers: Headers;
  withBody: boolean;
}

/**
 * Send the upload, and each redirect it is answered with.
 *
 * @param url - Where to send it
 * @param init - The request as fetch would take it; its body is `source`
 * @param source - The body
 * @param wrap - Turns a stream of the body into the one sent, e.g. to count it
 * @returns The final answer
 *
 * @example
 * ```ts
 * await sendUpload(url, init, toUploadSource(form), (s) => countedStream(s, size, report));
 * ```
 */
export async function sendUpload(
  url: string,
  init: RequestInit & { method: string },
  source: UploadSource,
  wrap: (stream: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>,
): Promise<Response> {
  const follows = source.replayable && (init.redirect ?? "follow") === "follow";
  let hop: Hop = { url, method: init.method, headers: new Headers(init.headers), withBody: true };

  for (let count = 0; ; count++) {
    const response = await fetch(hop.url, {
      ...init,
      method: hop.method,
      headers: hop.headers,
      body: hop.withBody ? wrap(source.open()) : null,
      redirect: follows ? "manual" : init.redirect,
      duplex: "half",
    } as RequestInit);
    const location = follows && REDIRECTS.has(response.status) && response.headers.get("location");
    if (!location) return response;

    await response.body?.cancel();
    if (count === MAX_REDIRECTS) throw new TypeError("Too many redirects");
    hop = nextHop(hop, response.status, location);
  }
}

function nextHop(hop: Hop, status: number, location: string): Hop {
  const target = new URL(location, hop.url);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new TypeError(`Redirect to an unsupported scheme: ${target.protocol}`);
  }
  const headers = new Headers(hop.headers);
  const toGet = status === 303 ? hop.method !== "HEAD" : status <= 302 && hop.method === "POST";
  if (toGet) {
    for (const name of [...BODY_HEADERS, "content-length"]) headers.delete(name);
  }
  if (target.origin !== new URL(hop.url).origin) {
    for (const name of CREDENTIAL_HEADERS) headers.delete(name);
  }
  return {
    url: target.href,
    method: toGet ? "GET" : hop.method,
    headers,
    withBody: hop.withBody && !toGet,
  };
}
