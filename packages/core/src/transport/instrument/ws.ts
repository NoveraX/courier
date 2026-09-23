import type { RealtimeError } from "../../realtime/errors";
import type { ConnectionStatus, SSESubscription, WSChannel } from "../../realtime/types";
import { beginStream, type StreamMeta } from "./core";
import { instrumentSSE } from "./sse";

/**
 * Wrap a WSChannel with browser-side studio instrumentation.
 *
 * Tracks incoming "data" events as stream:message and lifecycle changes
 * via the "status" channel. Returns the original channel unchanged when
 * studio hooks are not installed.
 *
 * Lifecycle reasons:
 * - `complete` — `disconnected` status reached after a clean shutdown
 *                (server-initiated close or natural EOF)
 * - `disconnect` — consumer called `.close()` directly on the wrapper
 *
 * Note: the underlying `WSChannel` contract has no error event. A channel
 * whose `send` settles — the in-process one does — keeps doing so through
 * the wrapper, which hands back whatever the channel returned: dropping it
 * turned a refused message into an unhandled rejection that ended the
 * process. Data-listener exceptions are out of scope here. When the
 * underlying transport fails and transitions straight to `disconnected`,
 * the close is reported as `complete`.
 *
 * Reconnect cycles (`connecting`/`reconnecting`) do NOT trigger close —
 * the lifecycle spans the entire WSChannel lifetime, not individual sockets.
 */
export function instrumentWSChannel<TChannel extends WSChannel<never, unknown>>(
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

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    unsubData();
    unsubStatus();
  };

  // Inbound (server→client) frames are tagged "data"
  const unsubData = inner.on("data", (data) => {
    instr.emitMessage(data, "data");
  });

  const unsubStatus = inner.on("status", (status: ConnectionStatus) => {
    if (status === "disconnected") {
      // The WSChannel contract has no error event — natural disconnects
      // are always reported as complete. User-initiated close goes through
      // the wrapper's `close()` method below and emits `disconnect` first.
      instr.emitClose("complete");
      cleanup();
    }
  });

  const wrapped = {
    send(data: unknown) {
      // Outbound (client→server) frames are tagged "message" so the
      // Stream tab can render an upward arrow distinct from inbound data.
      instr.emitMessage(data, "message");
      return inner.send(data);
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
 * direct/proxy boundaries can be grepped and instrumented uniformly.
 */
export function instrumentWSPush<TData>(
  subscription: SSESubscription<TData>,
  meta: StreamMeta,
): SSESubscription<TData> {
  return instrumentSSE(subscription, meta);
}
