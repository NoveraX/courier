import { createLogger } from "../logger";
import type { WebSocketLike } from "../realtime/adapters";
import type { createHeartbeat } from "../realtime/ws/heartbeat";
import { WS_CODE } from "../realtime/ws/ws-codes";
import { registerPlaygroundAbort } from "../studio";
import { socketError } from "../utils/socket-error";
import type { WSSocketContext } from "./ws-context";
import { closeSubscriptionEntry } from "./ws-dispatch-helpers";
import type { WSInbox } from "./ws-inbox";
import type { IPTracker } from "./ws-ip-tracker";
import type { InternalConnectionRegistry } from "./ws-registry-types";
import { routeMessage } from "./ws-route-message";
import type { createServerTopicManager } from "./ws-topics";
import type { WSHandlerConfig } from "./ws-types";

const log = createLogger("WS");

/** Route the frames of an admitted socket, and wire its close and error events */
export function wireEvents(
  ws: WebSocketLike,
  inbox: WSInbox,
  ctx: WSSocketContext,
  heartbeat: ReturnType<typeof createHeartbeat>,
  topicManager: ReturnType<typeof createServerTopicManager>,
  config: WSHandlerConfig,
  registry: InternalConnectionRegistry,
  ipTracker?: IPTracker,
): void {
  // Studio Playground correlation: register an in-process abort callback so
  // the playground executor can force-close this socket via the global
  // registry. Without this, Node loopback fetch abort doesn't propagate to
  // the WS upgrade and the user sees "Unsubscribe" do nothing. The unregister
  // fires from the close listener below so the registry doesn't leak entries
  // across reconnect cycles.
  const unregisterPlaygroundAbort = ctx.playgroundRequestId
    ? registerPlaygroundAbort(ctx.playgroundRequestId, () => {
        ctx.session.close({
          kind: "application",
          code: WS_CODE.NORMAL,
          reason: "Cancelled by Studio Playground",
        });
      })
    : undefined;

  inbox.open((raw) => {
    /* A frame that fails where nothing expected it ends its own connection,
       never the process the other connections live in. */
    try {
      routeMessage(ctx, raw, heartbeat);
    } catch (error) {
      log.error(`A frame of connection ${ctx.connectionId} could not be handled`, error);
      ctx.session.close({ kind: "internal" });
    }
  });

  ws.addEventListener("close", async (event) => {
    // Mark closed FIRST so any in-flight `handleSubscribe` await chain bails
    // out on its next guard check before mutating per-connection state.
    ctx.closed = true;
    ctx.session.dispose();
    unregisterPlaygroundAbort?.();
    heartbeat.stop();
    ipTracker?.release(ctx.clientIP);
    registry.remove(ctx.connectionId);
    ctx.bridge?.onConnectionClose();
    await topicManager.disconnectAll(ctx.connectionId);

    // Close Studio's record of each subscription still open, those still
    // opening too. The set is copied first, as each close takes its record
    // out, through the helper, whose claim before the hooks fire keeps a
    // hook that closes a record again from firing twice.
    for (const record of [...ctx.records]) {
      closeSubscriptionEntry(ctx, record, "disconnect");
    }
    try {
      await config.onDisconnect?.({
        connectionId: ctx.connectionId,
        meta: ctx.meta,
        code: event.code,
      });
    } catch (err) {
      log.warn("onDisconnect hook failed", err);
    }
  });

  ws.addEventListener("error", (event) => {
    heartbeat.stop();
    try {
      config.onError?.({
        connectionId: ctx.connectionId,
        meta: ctx.meta,
        error: socketError(event),
      });
    } catch (err) {
      log.warn("onError hook failed", err);
    }
  });
}
