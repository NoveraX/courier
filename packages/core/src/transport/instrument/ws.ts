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
 * Note: the underlying `WSChannel` contract has no error event. Errors
 * surface either as: (a) thrown rejections from `send()` (handled by the
 * caller's try/catch), or (b) data-listener exceptions (out of scope here
 * — the wrapper does not capture them). When the underlying transport
 * fails and transitions straight to `disconnected`, the close is reported
 * as `complete`. A future protocol revision may add an explicit error
 * channel; until then this behavior matches the WSChannel contract.
 *
 * Reconnect cycles (`connecting`/`reconnecting`) do NOT trigger close —
 * the lifecycle spans the entire WSChannel lifetime, not individual sockets.
 */
export function instrumentWSChannel<TSend, TReceive>(
  channel: WSChannel<TSend, TReceive>,
  meta: StreamMeta,
  externalRequestId?: string,
): WSChannel<TSend, TReceive> {
  const instr = beginStream(meta, externalRequestId);
  if (!instr) return channel;

  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    unsubData();
    unsubStatus();
  };

  // Inbound (server→client) frames are tagged "data"
  const unsubData = channel.on("data", (data: TReceive) => {
    instr.emitMessage(data, "data");
  });

  const unsubStatus = channel.on("status", (status: ConnectionStatus) => {
    if (status === "disconnected") {
      // The WSChannel contract has no error event — natural disconnects
      // are always reported as complete. User-initiated close goes through
      // the wrapper's `close()` method below and emits `disconnect` first.
      instr.emitClose("complete");
      cleanup();
    }
  });

  const originalClose = channel.close.bind(channel);

  return {
    send(data: TSend) {
      // Outbound (client→server) frames are tagged "message" so the
      // Stream tab can render an upward arrow distinct from inbound data.
      instr.emitMessage(data, "message");
      channel.send(data);
    },
    on(event, handler) {
      // Pass-through with same overload signature as WSChannel.on
      if (event === "data") {
        return channel.on("data", handler as (data: TReceive) => void);
      }
      return channel.on("status", handler as (status: ConnectionStatus) => void);
    },
    close() {
      instr.emitClose("disconnect");
      cleanup();
      originalClose();
    },
    get status() {
      return channel.status;
    },
  };
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
