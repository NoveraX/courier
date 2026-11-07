import { createLogger } from "../../logger";
import { layerHeaders } from "../../utils/layer-headers";
import { ONCE } from "../../utils/own";
import { REQUEST_MEMBERS } from "../../utils/request-members";
import { CLIENT_LIMITS } from "../client-limits";
import { fingerprintOf } from "../credentials-fingerprint";
import { ConnectionError, type RealtimeError } from "../errors";
import type { SSEConnectionCtx } from "./sse-connection";
import { eventStreamOf, refusal, SSEResponseError } from "./sse-response";
import type { SSEConnectInit } from "./sse-types";

const log = createLogger("SSE");

/**
 * Open one connection of a stream in the time a socket has to open: what
 * `beforeConnect` gives it, its request, and the server's answer, a
 * refusal's body included. One that takes longer is let go of and fails as
 * a dropped connection does, so a balancer that took the request and never
 * answers is not waited for until the platform gives up, if it ever does.
 *
 * @param ctx - The subscription's connection loop
 * @param connection - The connection's own abort, which ends the attempt
 * @returns The event stream the server accepted the connection with, or
 *   the error the stream ends with: credentials refused already, or an
 *   answer that is no event stream
 * @throws SSEResponseError when the server refuses the request
 * @throws ConnectionError when it did not answer in time
 */
export async function openStream<TData>(
  ctx: SSEConnectionCtx<TData>,
  connection: AbortController,
): Promise<ReadableStream<Uint8Array> | RealtimeError> {
  const { signal } = connection;
  let late = false;
  const deadline = setTimeout(() => {
    late = true;
    connection.abort();
  }, CLIENT_LIMITS.SSE_CONNECT_TIMEOUT_MS);
  try {
    const opened = await within(signal, ctx.config.beforeConnect?.());
    const refused = sameAsRefused(ctx, opened);
    if (refused) return refused;
    const send = ctx.config.fetch ?? fetch;
    /* What the request is, said of its own, as an HTTP call's is: the platform reads a field
       its init does not have from the init's prototype. */
    const request = send(ctx.url, {
      __proto__: null,
      ...REQUEST_MEMBERS,
      ...opened?.init,
      method: "GET",
      headers: layerHeaders(opened?.headers, requestHeaders(ctx)),
      body: null,
      signal,
    } as RequestInit);
    const response = await within(signal, request, (answer) => {
      answer.body?.cancel().catch(() => undefined);
    });
    if (!response.ok) throw await refusal(response, signal);
    const body = eventStreamOf(response);
    if (body instanceof ConnectionError) {
      await response.body?.cancel();
      log.error("SSE response is not an event stream, not reconnecting", body);
      return body;
    }
    ctx.config.onResponse?.(response);
    return body;
  } catch (error) {
    /* A refusal cut short keeps its status, and the wait it asked for. */
    if (late && !(error instanceof SSEResponseError)) {
      throw new ConnectionError("The stream did not open in time");
    }
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

/*
 * What the attempt waits for, given up when the attempt is: `beforeConnect`
 * takes no signal, and a `fetch` of the source's own may not pass it on.
 * What comes after that is let go of.
 */
function within<T>(
  signal: AbortSignal,
  step: T | PromiseLike<T>,
  letGo?: (late: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abandon = () => reject(signal.reason);
    if (signal.aborted) abandon();
    else signal.addEventListener("abort", abandon, ONCE);
    Promise.resolve(step).then(
      (value) => {
        signal.removeEventListener("abort", abandon);
        if (signal.aborted) letGo?.(value);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abandon);
        reject(error);
      },
    );
  });
}

/*
 * The credentials of the connection being opened, against those the server
 * last refused with 401: the same again end the stream with that refusal,
 * as the server would answer them; others are the one attempt it allows.
 * Only the session's headers are compared — what a token is carried in.
 */
function sameAsRefused<TData>(
  ctx: SSEConnectionCtx<TData>,
  opened: SSEConnectInit | undefined,
): RealtimeError | undefined {
  ctx.opened = fingerprintOf(opened?.headers ?? {});
  const { refused } = ctx;
  if (refused === undefined || refused.retried) return undefined;
  if (refused.fingerprint === ctx.opened) return refused.error;
  refused.retried = true;
  return undefined;
}

function requestHeaders<TData>(ctx: SSEConnectionCtx<TData>): Record<string, string> {
  const headers: Record<string, string> = { Accept: "text/event-stream", ...ctx.config.headers };
  if (ctx.lastEventId) headers["Last-Event-ID"] = ctx.lastEventId;
  return headers;
}
