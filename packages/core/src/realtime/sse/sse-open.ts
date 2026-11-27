import type { ConfigurationError } from "../../errors/configuration-error";
import { createLogger } from "../../logger";
import { layerHeaders } from "../../utils/layer-headers";
import { ownFields } from "../../utils/own";
import { REQUEST_MEMBERS } from "../../utils/request-members";
import { withinSignal } from "../../utils/within-signal";
import { CLIENT_LIMITS } from "../client-limits";
import { fingerprintOf } from "../credentials-fingerprint";
import { ConnectionError, type RealtimeError } from "../errors";
import type { SSEConnectionCtx } from "./sse-connection";
import { unstreamedAnswer } from "./sse-fetch";
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
 *   the error the stream ends with: credentials refused already, an answer
 *   that is no event stream, or one its fetch handed over whole, from
 *   which no stream can be read
 * @throws SSEResponseError when the server refuses the request
 * @throws ConnectionError when it did not answer in time
 */
export async function openStream<TData>(
  ctx: SSEConnectionCtx<TData>,
  connection: AbortController,
): Promise<ReadableStream<Uint8Array> | RealtimeError | ConfigurationError> {
  const { signal } = connection;
  let late = false;
  const deadline = setTimeout(() => {
    late = true;
    connection.abort();
  }, CLIENT_LIMITS.SSE_CONNECT_TIMEOUT_MS);
  try {
    /* What it gave, read as its own fields: a field it does not have, the platform's prototype
       answers for none of the stream's. */
    const opened = ownFields(await withinSignal(signal, ctx.config.beforeConnect?.()));
    const refused = sameAsRefused(ctx, opened);
    if (refused) return refused;
    const send = ctx.config.fetch;
    /* What the request is, said of its own, as an HTTP call's is: the platform reads a field
       its init does not have from the init's prototype. */
    const request = send(ctx.url, {
      __proto__: null,
      ...REQUEST_MEMBERS,
      ...opened.init,
      method: "GET",
      headers: layerHeaders(opened.headers, requestHeaders(ctx)),
      body: null,
      signal,
    } as RequestInit);
    const response = await withinSignal(signal, request, (answer) => {
      answer.body?.cancel().catch(() => undefined);
    });
    const unread = unstreamedAnswer(response);
    if (unread) return unread;
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
 * The credentials of the connection being opened, against those the server
 * last refused with 401: the same again end the stream with that refusal,
 * as the server would answer them; others are the one attempt it allows.
 * Only the session's headers are compared — what a token is carried in.
 */
function sameAsRefused<TData>(
  ctx: SSEConnectionCtx<TData>,
  opened: Partial<SSEConnectInit>,
): RealtimeError | undefined {
  ctx.opened = fingerprintOf(opened.headers ?? {});
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
