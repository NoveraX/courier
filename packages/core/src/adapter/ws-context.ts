import type { Sources } from "../define/types";
import { createLogger } from "../logger";
import type { WebSocketLike } from "../realtime/adapters";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { encodeMessage } from "../realtime/ws/ws-protocol";
import { generateRequestId, studioHooks } from "../studio";
import { LIMITS } from "./limits";
import { requireSources } from "./require-sources";
import type { PubSubBridge } from "./ws-pubsub-bridge";
import type { RateLimitBucket } from "./ws-rate-limit";
import { createBucket } from "./ws-rate-limit";
import type { InternalConnectionRegistry } from "./ws-registry";
import type { createServerTopicManager } from "./ws-topics";
import type { WSHandlerConfig } from "./ws-types";

const log = createLogger("WS");

/** Per-subscription Studio tracking record */
export interface SubscriptionTracker {
  /** Studio-generated requestId for this subscription */
  requestId: string;
  /** Per-subscription message sequence counter */
  seq: { value: number };
  /** High-resolution timestamp when subscription opened (performance.now()) */
  t0: number;
}

/** Internal context passed between handler helpers */
export interface WSSocketContext {
  connectionId: string;
  requestId: string;
  /**
   * Optional pre-allocated requestId from the Studio Playground proxy
   * executor — extracted from the upgrade URL's `_playground_rid` query
   * param. When set, `handleSubscribe` uses it as the per-subscription
   * Studio requestId instead of generating a new one, so events emitted
   * by `instrumentSSE`/dispatch correlate back to the playground tab
   * that initiated the Subscribe. Undefined for production browser
   * connections.
   */
  playgroundRequestId: string | undefined;
  /**
   * Set to `true` by the close listener in `wireEvents`. Async dispatch
   * handlers MUST check this after every `await` and bail out without
   * mutating per-connection state — otherwise an entry written after the
   * close listener has already drained `subscriptionIds`/`topicManager`
   * would leak past the connection's lifetime.
   */
  closed: boolean;
  /** Per-subscription Studio tracking (topic → tracker) */
  subscriptionIds: Map<string, SubscriptionTracker>;
  sources: Sources;
  pubsub: WSHandlerConfig["pubsub"];
  registry: InternalConnectionRegistry;
  bridge: PubSubBridge | undefined;
  topicManager: ReturnType<typeof createServerTopicManager>;
  sendMessage: (msg: WSMessage) => void;
  /** Send a pre-encoded JSON string — avoids redundant JSON.stringify on broadcast */
  sendEncoded: (encoded: string) => void;
  dt: typeof studioHooks;
  seq: { value: number };
  t0: number;
  request: Request;
  meta: Record<string, unknown>;
  maxSubscriptions: number;
  maxMessageSize: number;
  middlewareTimeoutMs: number;
  maxMessagesPerSecond: number;
  rateLimitBucket: RateLimitBucket;
  authorize: WSHandlerConfig["authorize"];
  authorizeMessage: WSHandlerConfig["authorizeMessage"];
  onTokenRefresh: WSHandlerConfig["onTokenRefresh"];
  authRequiredTimeoutMs: number;
  clientIP: string;
}

/**
 * Build per-connection context for a WebSocket connection.
 * Creates a unique connectionId, wires sendMessage with backpressure guard,
 * initializes rate limit bucket, and emits Studio stream:open event.
 *
 * @param ws - WebSocket-like connection object
 * @param config - Handler configuration (sources, limits, hooks)
 * @param topicManager - Server topic manager for subscription tracking
 * @param registry - Connection registry for broadcast/send
 * @param bridge - Optional PubSub bridge for cross-replica messaging
 * @param request - Original HTTP upgrade request
 * @returns Fully initialized per-connection context
 */
export function buildContext(
  ws: WebSocketLike,
  config: WSHandlerConfig,
  topicManager: ReturnType<typeof createServerTopicManager>,
  registry: InternalConnectionRegistry,
  bridge: PubSubBridge | undefined,
  request: Request,
): WSSocketContext {
  const dt = studioHooks;
  const maxBuf = config.maxBufferedAmount ?? LIMITS.MAX_BUFFERED_AMOUNT;
  const maxConsecutiveDrops = config.maxConsecutiveDrops ?? LIMITS.MAX_CONSECUTIVE_DROPS;
  const connectionId = crypto.randomUUID();
  const requestId = generateRequestId();
  // Studio Playground proxy executor forwards its pre-allocated requestId
  // via `?_playground_rid=<id>` on the WS upgrade URL. Extract it once at
  // connection time so `handleSubscribe` can use it as the per-subscription
  // Studio requestId. Production browser connections never set this param.
  let playgroundRequestId: string | undefined;
  try {
    playgroundRequestId = new URL(request.url).searchParams.get("_playground_rid") ?? undefined;
  } catch {
    // Malformed URL — silently ignore; production WS upgrades always have a
    // valid URL, and a corrupted one is the upstream proxy/handshake's bug.
    playgroundRequestId = undefined;
  }
  const subscriptionIds = new Map<string, SubscriptionTracker>();
  let consecutiveDrops = 0;

  /** Shared backpressure guard — returns true if message can be sent */
  function guardBackpressure(topic: string | undefined): boolean {
    if (ws.readyState !== 1) return false;
    if (ws.bufferedAmount > maxBuf) {
      consecutiveDrops++;
      log.warn(
        `Buffer overflow — dropped (conn=${connectionId}, buf=${ws.bufferedAmount}, drops=${consecutiveDrops})`,
      );
      config.onMessageDrop?.({ connectionId, topic, bufferedAmount: ws.bufferedAmount });
      if (maxConsecutiveDrops > 0 && consecutiveDrops >= maxConsecutiveDrops) {
        log.warn(`Persistent overflow — closing slow connection (conn=${connectionId})`);
        ws.close(4008, "Slow consumer");
      }
      return false;
    }
    consecutiveDrops = 0;
    return true;
  }

  return {
    connectionId,
    requestId,
    playgroundRequestId,
    closed: false,
    subscriptionIds,
    sources: requireSources(),
    pubsub: config.pubsub,
    registry,
    bridge,
    topicManager,
    sendMessage: (msg) => {
      if (guardBackpressure(msg.topic)) ws.send(encodeMessage(msg));
    },
    sendEncoded: (encoded) => {
      if (guardBackpressure(undefined)) ws.send(encoded);
    },
    dt,
    seq: { value: 0 },
    t0: performance.now(),
    request,
    meta: {},
    maxSubscriptions:
      config.maxSubscriptionsPerConnection ?? LIMITS.MAX_SUBSCRIPTIONS_PER_CONNECTION,
    maxMessageSize: config.maxMessageSize ?? LIMITS.MAX_MESSAGE_SIZE,
    middlewareTimeoutMs: config.middlewareTimeoutMs ?? LIMITS.MIDDLEWARE_TIMEOUT_MS,
    maxMessagesPerSecond: config.maxMessagesPerSecond ?? LIMITS.MAX_MESSAGES_PER_SECOND,
    rateLimitBucket: createBucket(config.maxMessagesPerSecond ?? LIMITS.MAX_MESSAGES_PER_SECOND),
    authorize: config.authorize,
    authorizeMessage: config.authorizeMessage,
    onTokenRefresh: config.onTokenRefresh,
    authRequiredTimeoutMs: config.authRequiredTimeoutMs ?? 30_000,
    clientIP: "",
  };
}
