import type { Sources } from "../define/types";
import { LIMITS } from "../limits";
import type { RefusalLog } from "../logger/refusal-log";
import type { WebSocketLike } from "../realtime/adapters";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { encodeMessage } from "../realtime/ws/ws-protocol";
import { generateRequestId, PLAYGROUND_RID_PARAM, playgroundRidOf, studioHooks } from "../studio";
import { randomId } from "../utils/random-id";
import { servedSources } from "./served-sources";
import { createBackpressure, type FrameKind, kindOf } from "./ws-backpressure";
import type { PubSubBridge } from "./ws-pubsub-bridge";
import { createBucket, type RateLimitBucket } from "./ws-rate-limit";
import type { InternalConnectionRegistry } from "./ws-registry-types";
import type { ResumeGate } from "./ws-resume";
import type { WSSession } from "./ws-session";
import type { createServerTopicManager } from "./ws-topics";
import type { WSHandlerConfig } from "./ws-types";

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
   * close listener has already drained `records`/`topicManager` would leak
   * past the connection's lifetime.
   */
  closed: boolean;
  /**
   * Studio's records of the connection's subscriptions still open. Each
   * belongs to one subscription, whose entry holds it, and is closed once,
   * by what ended that subscription: a subscription to the same topic made
   * since has a record of its own.
   */
  records: Set<SubscriptionTracker>;
  /**
   * Topics whose subscribe is still on its way in — validation, middleware
   * and authorization are awaited — counted against `maxSubscriptions`,
   * each with the subscription's opening, which a message to it waits for.
   */
  subscribing: Map<string, Promise<void>>;
  /** Topics whose subscription resumes from the pub/sub adapter's log, each with the live frames it is not sent yet */
  resuming: Map<string, ResumeGate>;
  sources: Sources;
  registry: InternalConnectionRegistry;
  bridge: PubSubBridge | undefined;
  topicManager: ReturnType<typeof createServerTopicManager>;
  /** Send a frame: a topic's event is dropped while the client reads too slowly, any other never */
  sendMessage: (msg: WSMessage) => void;
  /**
   * Send a frame encoded once for every connection it goes to — an event
   * unless `kind` says otherwise, dropped while the client reads too slowly
   */
  sendEncoded: (encoded: string, kind?: FrameKind) => void;
  /**
   * The events dropped so far for a slow reader: one dropped while a
   * subscription opens may be one it missed, so it did not recover
   */
  readonly dropped: number;
  dt: typeof studioHooks;
  seq: { value: number };
  t0: number;
  /** The upgrade request, as it came */
  handshake: Request;
  /**
   * The upgrade request with the headers of the client's `auth` frame — what
   * hooks, middleware and the session read; renewed by an accepted `onReauth`
   */
  request: Request;
  meta: Record<string, unknown>;
  maxSubscriptions: number;
  maxMessageSize: number;
  middlewareTimeoutMs: number;
  maxMessagesPerSecond: number;
  rateLimitBucket: RateLimitBucket;
  /**
   * Subscribe, unsubscribe and auth frames per second: twice
   * `maxSubscriptions`, so a client that renews every subscription at once is
   * never refused, while a flood of them is.
   */
  maxControlPerSecond: number;
  controlBucket: RateLimitBucket;
  authorize: WSHandlerConfig["authorize"];
  authorizeMessage: WSHandlerConfig["authorizeMessage"];
  onReauth: WSHandlerConfig["onReauth"];
  /** The checks of the credentials the connection sends again, one at a time: settles once the latest has */
  reauthing: Promise<void>;
  authRequiredTimeoutMs: number;
  clientIP: string;
  /** The handler's log of refusals, which every connection of it shares */
  refusals: RefusalLog;
  /** Where the connection's admission, its close and its credentials' deadline are kept */
  session: WSSession;
}

/**
 * Build per-connection context for a WebSocket connection.
 * Creates a unique connectionId, wires its sends through the backpressure
 * guard, initializes rate limit bucket, and emits Studio stream:open event.
 *
 * @param ws - WebSocket-like connection object
 * @param session - The socket's session, made as the socket was handed over
 * @param config - Handler configuration (sources, limits, hooks)
 * @param topicManager - Server topic manager for subscription tracking
 * @param registry - Connection registry for broadcast/send
 * @param bridge - Optional PubSub bridge for cross-replica messaging
 * @param request - Original HTTP upgrade request
 * @param refusals - The handler's log of refusals
 * @returns Fully initialized per-connection context
 * @throws ConfigurationError when the handler names no sources and none are registered
 */
export function buildContext(
  ws: WebSocketLike,
  session: WSSession,
  config: WSHandlerConfig,
  topicManager: ReturnType<typeof createServerTopicManager>,
  registry: InternalConnectionRegistry,
  bridge: PubSubBridge | undefined,
  request: Request,
  refusals: RefusalLog,
): WSSocketContext {
  const dt = studioHooks;
  const maxSubscriptions =
    config.maxSubscriptionsPerConnection ?? LIMITS.MAX_SUBSCRIPTIONS_PER_CONNECTION;
  const connectionId = randomId();
  const requestId = generateRequestId();
  // Studio Playground proxy executor forwards its pre-allocated requestId
  // via `?_playground_rid=<id>` on the WS upgrade URL. Extract it once at
  // connection time so `handleSubscribe` can use it as the per-subscription
  // Studio requestId. Production browser connections never set this param.
  let playgroundRequestId: string | undefined;
  try {
    playgroundRequestId = playgroundRidOf(
      new URL(request.url).searchParams.get(PLAYGROUND_RID_PARAM),
    );
  } catch {
    // Malformed URL — silently ignore; production WS upgrades always have a
    // valid URL, and a corrupted one is the upstream proxy/handshake's bug.
    playgroundRequestId = undefined;
  }
  const backpressure = createBackpressure(ws, session, config, connectionId);

  return {
    connectionId,
    requestId,
    playgroundRequestId,
    closed: false,
    records: new Set(),
    subscribing: new Map(),
    resuming: new Map(),
    sources: servedSources(config.sources),
    registry,
    bridge,
    topicManager,
    sendMessage: (msg) => {
      if (backpressure.admits(kindOf(msg.type), msg.topic)) ws.send(encodeMessage(msg));
    },
    sendEncoded: (encoded, kind = "event") => {
      if (backpressure.admits(kind, undefined)) ws.send(encoded);
    },
    get dropped() {
      return backpressure.dropped;
    },
    dt,
    seq: { value: 0 },
    t0: performance.now(),
    handshake: request,
    request,
    meta: {},
    maxSubscriptions,
    maxMessageSize: config.maxMessageSize ?? LIMITS.MAX_MESSAGE_SIZE,
    middlewareTimeoutMs: config.middlewareTimeoutMs ?? LIMITS.MIDDLEWARE_TIMEOUT_MS,
    maxMessagesPerSecond: config.maxMessagesPerSecond ?? LIMITS.MAX_MESSAGES_PER_SECOND,
    rateLimitBucket: createBucket(config.maxMessagesPerSecond ?? LIMITS.MAX_MESSAGES_PER_SECOND),
    maxControlPerSecond: 2 * maxSubscriptions,
    controlBucket: createBucket(2 * maxSubscriptions),
    authorize: config.authorize,
    authorizeMessage: config.authorizeMessage,
    onReauth: config.onReauth,
    reauthing: Promise.resolve(),
    authRequiredTimeoutMs: config.authRequiredTimeoutMs ?? 30_000,
    clientIP: "",
    refusals,
    session,
  };
}
