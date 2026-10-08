import { createLogger } from "../logger";
import type { WebSocketLike } from "../realtime/adapters";
import type { createHeartbeat } from "../realtime/ws/heartbeat";
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
        try {
          ws.close(1000, "Cancelled by Studio Playground");
        } catch {
          // ws may already be closing — ignore.
        }
      })
    : undefined;

  inbox.open((raw) => {
    /* A frame that fails where nothing expected it ends its own connection,
       never the process the other connections live in. */
    try {
      routeMessage(ctx, raw, heartbeat);
    } catch (error) {
      log.error(`A frame of connection ${ctx.connectionId} could not be handled`, error);
      ws.close(1011, "Internal error");
    }
  });

  ws.addEventListener("close", async (event) => {
    // Mark closed FIRST so any in-flight `handleSubscribe` await chain bails
    // out on its next guard check before mutating per-connection state.
    ctx.closed = true;
    unregisterPlaygroundAbort?.();
    heartbeat.stop();
    ipTracker?.release(ctx.clientIP);
    registry.remove(ctx.connectionId);
    void ctx.bridge?.onConnectionClose();
    await topicManager.disconnectAll(ctx.connectionId);

    // Close each per-subscription stream entry. We snapshot the topic list
    // first because closeSubscriptionEntry mutates ctx.subscriptionIds, and
    // we route through the helper so the delete-before-fire ownership claim
    // protects against re-entrant hooks (a Studio onWSUntrack callback that
    // calls back into closeSubscriptionEntry would otherwise double-fire).
    const closingTopics = Array.from(ctx.subscriptionIds.keys());
    for (const topic of closingTopics) {
      closeSubscriptionEntry(ctx, topic, "disconnect");
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
