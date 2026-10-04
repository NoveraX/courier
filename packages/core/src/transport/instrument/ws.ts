import type { RealtimeError } from "../../realtime/errors";
import { observeData } from "../../realtime/observe-data";
import type { ConnectionStatus, SSESubscription, WSChannel } from "../../realtime/types";
import { beginStream, type StreamMeta } from "./core";
import { instrumentSSE } from "./sse";

/** A channel the wrapper can observe: a `WSChannel`, or one whose `send` settles. */
type InstrumentedChannel = Omit<WSChannel<never, unknown>, "send"> & {
  send(data: never): unknown;
};

/**
 * Wrap a WSChannel with browser-side studio instrumentation.
 *
 * Tracks incoming "data" events as stream:message and lifecycle changes
 * via the "status" channel. A message sent is recorded once the channel took
 * it; one it dropped is not. Returns the original channel unchanged when
 * studio hooks are not installed.
 *
 * Lifecycle reasons:
 * - `complete` — `disconnected` status reached after a clean shutdown
 *                (server-initiated close or natural EOF)
 * - `error` — the channel ended with an error: its join refused, closed by
 *             the server with a reason, or its connection refused for good
 * - `disconnect` — consumer called `.close()` directly on the wrapper
 *
 * A channel's end error comes in the same turn as its `disconnected`, so the
 * close is recorded once that turn is over, whichever of the two came first.
 * An error the channel goes on after, such as a refused message, is
 * forgotten at the end of its turn: every one was recorded as `complete`
 * before.
 *
 * A channel whose `send` settles — the in-process one does — keeps doing so
 * through the wrapper, which hands back whatever the channel returned, so a
 * refused message reaches the caller as a rejection it can handle rather
 * than an unhandled one that ends the process. Data-listener exceptions are
 * out of scope here.
 *
 * Reconnect cycles (`connecting`/`reconnecting`) do NOT trigger close —
 * the lifecycle spans the entire WSChannel lifetime, not individual sockets.
 */
export function instrumentWSChannel<TChannel extends InstrumentedChannel>(
  channel: TChannel,
  meta: StreamMeta,
  externalRequestId?: string,
): TChannel {
  const instr = beginStream(meta, externalRequestId);
  if (!instr) return channel;

  /* Typed loosely only to be wrapped; the wrapper is handed back as the
     caller's own channel type, whose members it mirrors one for one. */
  const inner = channel as WSChannel<unknown, unknown>;
  let cleaned = false;
  let ending = false;
  let endError: RealtimeError | undefined;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    unsubData();
    unsubStatus();
    unsubError();
  };

  /* Inbound (server→client) frames are tagged "data". Watched rather than
     listened to, so what a holding channel sent on join stays for the
     caller's own first listener. */
  const unsubData = observeData(inner, (data) => {
    instr.emitMessage(data, "data");
  });

  const unsubError = inner.on("error", (error) => {
    endError = error;
    queueMicrotask(() => {
      if (!ending) endError = undefined;
    });
  });

  const unsubStatus = inner.on("status", (status: ConnectionStatus) => {
    if (status !== "disconnected" || ending) return;
    ending = true;
    /* User-initiated close goes through the wrapper's `close()` below, which
       records `disconnect` and stops listening first. */
    queueMicrotask(() => {
      if (cleaned) return;
      if (endError) instr.emitError(endError);
      else instr.emitClose("complete");
      cleanup();
    });
  });

  const wrapped = {
    send(data: unknown) {
      const result = inner.send(data);
      /* Recorded once the channel took it, tagged "message" so the Stream tab
         tells it from inbound data. A network channel says whether it did —
         `false` is a message dropped: the channel ended, no room to hold it,
         too large; an in-process one takes what it is sent while open. */
      const taken = typeof result === "boolean" ? result : inner.status !== "disconnected";
      if (taken) instr.emitMessage(data, "message");
      return result;
    },
    on(event: "data" | "status" | "error", handler: (arg: never) => void) {
      // Pass-through with same overload signature as WSChannel.on
      if (event === "data") return inner.on("data", handler as (data: unknown) => void);
      if (event === "error") return inner.on("error", handler as (error: RealtimeError) => void);
      return inner.on("status", handler as (status: ConnectionStatus) => void);
    },
    close() {
      instr.emitClose("disconnect");
      cleanup();
      inner.close();
    },
    get status() {
      return inner.status;
    },
  };
  return wrapped as WSChannel<unknown, unknown> as TChannel;
}

/**
 * Wrap a WS push subscription (server→client only, uses SSESubscription shape)
 * with browser-side studio instrumentation. Semantically identical to SSE
 * instrumentation — exposed as a separate function so call sites at the
 * direct/proxy boundaries can be grepped and instrumented uniformly. A
 * push Studio opened itself is shown under the id it names.
 */
export function instrumentWSPush<TData>(
  subscription: SSESubscription<TData>,
  meta: StreamMeta,
  externalRequestId?: string,
): SSESubscription<TData> {
  return instrumentSSE(
    subscription,
    meta,
    externalRequestId === undefined ? undefined : beginStream(meta, externalRequestId),
  );
}
