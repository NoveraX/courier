import { LIMITS } from "../../adapter/limits";
import { createLogger } from "../../logger";
import { assertAbsoluteUrl } from "../../utils/absolute-url";
import { backoffDelay, hintedDelay, resolveBackoff } from "../backoff";
import { CLIENT_LIMITS } from "../client-limits";
import { fromErrorCode } from "../errors";
import { onResume } from "../resume-signals";
import { shareRetry } from "../retry-of";
import type { ConnectionStatus } from "../types";
import { connectionHooks } from "./connection-hooks";
import type { MachineContext } from "./connection-machine-types";
import { type ConnectionRuntime, createConnectionRuntime } from "./connection-runtime";
import { publicStateOf, retryOfState, statusOf } from "./connection-view";
import { createLiveness } from "./liveness";
import { createMessageQueue } from "./message-queue";
import { platformSocketFactory } from "./platform-socket";
import { sendToTopic, subscribeToTopic, type TopicOpsContext } from "./topic-operations";
import type { Subscription } from "./topic-subscription";
import { encodeMessage } from "./ws-protocol";
import { createTopicRegistry } from "./ws-topics";
import type { WSConnection, WSConnectionConfig } from "./ws-types";

const log = createLogger("WS");
const DEFAULT_MAX_BUFFERED = 1_048_576;

/**
 * Create a managed WebSocket connection with topic multiplexing: it
 * connects, proves who it is, and stays connected — reconnecting after a
 * drop with a backoff, at once when asked or when the page says the network
 * or the page is back, and taking a socket that has gone silent for dead.
 * Its status is `connected` once the server has admitted it.
 *
 * @throws {ConfigurationError} `URL_NOT_ABSOLUTE` for a path where no page resolves it, `INVALID_BACKOFF` or `INVALID_MESSAGE_QUEUE` for limits that do not hold
 * @example
 * const conn = createWSConnection({ url: "wss://realtime.example.com/ws" });
 * const unsub = conn.subscribe("chat:room", (msg) => console.log(msg));
 * conn.send("chat:room", { text: "hello" });
 * conn.close();
 */
export function createWSConnection(config: WSConnectionConfig): WSConnection {
  assertAbsoluteUrl(config.url);
  const backoff = resolveBackoff(config.backoff);
  const notices = new Set<string>();
  const notice = (kind: string, text: string): void => {
    if (notices.has(kind)) return;
    notices.add(kind);
    log.warn(text);
  };

  const queue = createMessageQueue<Subscription>(config.messageQueue, (oldest) => {
    notice(
      "drop-oldest",
      "The outbound queue was full: its oldest messages make room for newer ones",
    );
    const error = fromErrorCode(
      4429,
      "A message was dropped from the outbound queue for a newer one",
    );
    if (oldest.owner) topics.fail(oldest.topic, error);
  });
  const topics = createTopicRegistry({
    onForget: (s) => {
      const count = queue.forget(s);
      if (count > 0)
        log.warn(`${count} message(s) kept for ${s.topic} were dropped: it ended first`);
    },
    onMerge: (from, into) => queue.retarget(from, into),
  });
  const liveness = createLiveness({
    ping: () => runtime.send(encodeMessage({ type: "ping" })),
    onSilent: (forMs) => runtime.dispatch({ type: "silent", forMs }),
  });
  /* The protocol's default until a server's `auth_ok` says what it takes. */
  const limits = { maxMessageSize: LIMITS.MAX_MESSAGE_SIZE };

  const context = (now: number): MachineContext => ({
    now,
    delay: (step, hintMs) =>
      hintMs === undefined ? backoffDelay(step, backoff) : hintedDelay(hintMs, step, backoff),
    spread: () => Math.floor(Math.random() * CLIENT_LIMITS.RESUME_ONLINE_SPREAD_MS),
    connectTimeoutMs: CLIENT_LIMITS.WS_CONNECT_TIMEOUT_MS,
    authTimeoutMs: CLIENT_LIMITS.WS_AUTH_TIMEOUT_MS,
    stableMs: CLIENT_LIMITS.RECONNECT_STABLE_MS,
  });

  const runtime = createConnectionRuntime({
    config,
    log,
    factory: config.socketFactory ?? platformSocketFactory(config.webSocket, config.socketInit),
    context,
    hooks: connectionHooks({
      topics,
      queue,
      liveness,
      log,
      limits,
      renewable: config.credentials !== undefined,
      notice,
    }),
  });

  const ops: TopicOpsContext = {
    runtime,
    topics,
    queue,
    log,
    get maxMessageSize() {
      return limits.maxMessageSize;
    },
    maxBufferedAmount: config.maxBufferedAmount ?? DEFAULT_MAX_BUFFERED,
    overflowed: (topic) =>
      notice("overflow", `The outbound queue is full: a message on ${topic} was not kept`),
  };
  const stopResume =
    config.reconnectOnResume === false
      ? () => undefined
      : onResume((signal) => runtime.dispatch({ type: "resume", signal }));

  const connection: WSConnection = {
    subscribe: (topic, handler, variables) => subscribeToTopic(ops, topic, handler, variables),
    send: (topic, payload) => sendToTopic(ops, topic, payload),
    authenticate() {
      if (config.credentials === undefined) {
        log.warn("authenticate() has no credentials to send: the connection has none");
      } else {
        runtime.dispatch({ type: "renewal-requested" });
      }
    },
    reconnect() {
      const { state } = runtime;
      if (state.phase === "closed" && state.by === "client") {
        log.warn("reconnect() does nothing on a connection that was closed");
      } else {
        runtime.dispatch({ type: "reconnect" });
      }
    },
    close() {
      stopResume();
      runtime.dispatch({ type: "close" });
    },
    get status() {
      return statusOf(runtime.state);
    },
    get state() {
      return publicStateOf(runtime.state);
    },
    onStatusChange: (handler) => onStatus(runtime, handler),
    onStateChange: (handler) => runtime.onChange((state) => handler(publicStateOf(state))),
  };
  shareRetry(connection, () => retryOfState(runtime.state));
  if (config.onStatusChange) connection.onStatusChange(config.onStatusChange);
  runtime.dispatch({ type: "start" });
  return connection;
}

/* Hear the status as it changes: a new state of the same status is not told. */
function onStatus(
  runtime: ConnectionRuntime,
  handler: (status: ConnectionStatus) => void,
): () => void {
  let last = statusOf(runtime.state);
  return runtime.onChange((state) => {
    const status = statusOf(state);
    if (status === last) return;
    last = status;
    handler(status);
  });
}
