import type { PlatformFetch } from "../http-client/source-transport";
import type { WebBody } from "../http-client/web-types";
import { anySignal } from "./any-signal";
import { type CallProgress, heard } from "./call-progress";
import { countedStream } from "./counted-stream";
import { copiesOf, type FetchCopies } from "./fetch-copies";
import { fetchWithinOrigin } from "./fetch-within-origin";
import { isReadableStream } from "./is-readable-stream";
import { responseTakesStreams } from "./response-takes-streams";
import { sendAsStream } from "./send-as-stream";
import { isStreamedUpload } from "./streamed-upload";
import { sendingOf } from "./upload-sending";
import { wholeBody } from "./whole-body";

/** How a body sent as a stream is sent. */
export interface StreamedSend {
  /** The call's progress: its upload's callback hears each chunk once fetch has taken it */
  progress?: CallProgress | undefined;
  /** Redirects are followed on the request's origin alone */
  withinOrigin?: boolean | undefined;
  /** What sends it in place of the platform's `fetch` */
  fetch?: PlatformFetch | undefined;
}

/**
 * Send a request's body as the stream of its bytes, where a server should.
 *
 * A server has no XMLHttpRequest, so an upload whose progress is asked for
 * is streamed and counted as fetch takes it. A form, a `Blob` or a stream
 * is streamed too where the fetch that sends it would keep a copy of it for
 * as long as it sends it, as Node's does — every version a form or a `Blob`,
 * Node 22 and 24 a stream, and a source's own fetch on Node is taken to
 * (`copiesOf`) — and so is a `StreamedUpload`, which goes with its own
 * content type, and stops the request when it is refused while the upstream
 * takes none of it. React Native sends no stream at all: there a stream is
 * read whole and sent as its bytes. Code a page never runs: a bundler that
 * builds for the browser takes a stand-in that sends nothing.
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
  { progress, withinOrigin, fetch }: StreamedSend,
): Promise<Response> | undefined {
  const options = { withinOrigin, fetch };
  /* React Native sends no stream: its fetch, the whatwg-fetch polyfill, hands one to
     XMLHttpRequest, which cannot send it, and expo/fetch reads one whole; neither reports an
     upload as it goes. Nothing below is for it, and without Expo it has no streams to test a
     body against. */
  if (!responseTakesStreams()) {
    return isReadableStream(init.body) ? sentWhole(url, init, init.body, options) : undefined;
  }
  const sent = stoppedWithUpload(init);
  if (progress?.onUploadProgress) {
    /* What the callback throws ends the stream, and the call fails with it. */
    const onProgress = heard(progress, progress.onUploadProgress);
    return sendAsStream(
      url,
      sent,
      (stream, size) => countedStream(stream, size, onProgress, sent.signal),
      options,
    );
  }
  if (isStreamedUpload(init.body) || copied(init.body, copiesOf(fetch ?? globalThis.fetch))) {
    return sendAsStream(url, sent, (stream) => stream, options);
  }
  return undefined;
}

/* The request, stopped as well by its upload's refusal when it sends one the proxy sends on as
   it arrives: refused while the upstream takes none of it, it reaches no read to fail. */
function stoppedWithUpload<TInit extends RequestInit>(init: TInit): TInit {
  const refused = sendingOf(init.body)?.refused;
  if (refused === undefined) return init;
  return { ...init, signal: init.signal ? anySignal([init.signal, refused]) : refused };
}

/* A stream read whole, sent as its bytes: no longer a stream, so the request claims no duplex. */
async function sentWhole(
  url: string,
  { duplex: _duplex, ...init }: RequestInit & { duplex?: string },
  stream: ReadableStream<Uint8Array>,
  { withinOrigin, fetch: send = globalThis.fetch }: Omit<StreamedSend, "progress">,
): Promise<Response> {
  const whole = { __proto__: null, ...init, body: await wholeBody(stream, init.signal) };
  return withinOrigin ? fetchWithinOrigin(url, whole, send) : send(url, whole);
}

/* Whether the fetch that sends it would hold the whole body while it sends it. */
function copied(body: WebBody, copies: FetchCopies): boolean {
  if (body instanceof FormData || body instanceof Blob) return copies.forms;
  return isReadableStream(body) && copies.streams;
}
