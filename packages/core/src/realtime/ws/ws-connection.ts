import { LIMITS } from "../../adapter/limits";
import { createLogger } from "../../logger";
import { assertAbsoluteUrl } from "../../utils/absolute-url";
import { isReactNative } from "../../utils/is-react-native";
import { createConnectionState } from "../connection-state";
import { createMessageQueue } from "./message-queue";
import { createServerSilence } from "./server-silence";
import {
  sendControl,
  sendToTopic,
  subscribeToTopic,
  type TopicOpsContext,
} from "./topic-operations";
import { clearReconnectTimer, connect, dropSocket, type LifecycleContext } from "./ws-lifecycle";
import { encodeMessage } from "./ws-protocol";
import { createTopicRegistry } from "./ws-topics";
import type { WSClientSocket, WSConnection, WSConnectionConfig } from "./ws-types";

const log = createLogger("WS");
const DEFAULT_MAX_BUFFERED = 1_048_576;

/**
 * Create a managed WebSocket connection with topic multiplexing,
 * auto-reconnect and server-silence detection.
 *
 * @throws {ConfigurationError} `URL_NOT_ABSOLUTE` for a path where no page resolves it
 * @example
 * const conn = createWSConnection({ url: "wss://realtime.example.com/ws" });
 * const unsub = conn.subscribe("chat:room", (msg) => console.log(msg));
 * conn.send("chat:room", { text: "hello" });
 * conn.close();
 */
export function createWSConnection(config: WSConnectionConfig): WSConnection {
  assertAbsoluteUrl(config.url);
  const state = createConnectionState();
  const topics = createTopicRegistry({
    messageQueue: config.messageQueue,
    onDrop: (topic, count) =>
      log.warn(`${count} message(s) held for ${topic} were dropped before the server confirmed it`),
  });
  const queue = createMessageQueue(config.messageQueue);
  const maxBuffered = config.maxBufferedAmount ?? DEFAULT_MAX_BUFFERED;
  const factory = config.socketFactory ?? defaultFactory;

  const refs = {
    ws: null as WSClientSocket | null,
    frame: undefined,
    attempt: 0,
    closed: false,
    reconnectTimer: null as ReturnType<typeof setTimeout> | null,
  };

  const silence = createServerSilence({
    silenceMs: (config.heartbeat?.intervalMs ?? 25_000) + (config.heartbeat?.timeoutMs ?? 10_000),
    log,
    onSilenceTimeout: () => dropSocket(lifecycleCtx, 4100, "Server silence"),
  });

  const sendRaw = (data: string): boolean => {
    if (refs.ws?.readyState !== 1) {
      log.warn("Socket not open — dropped");
      return false;
    }
    if (refs.ws.bufferedAmount > maxBuffered) {
      log.warn("Backpressure — dropped");
      return false;
    }
    refs.ws.send(data);
    return true;
  };

  const opsCtx: TopicOpsContext = {
    state,
    topics,
    queue,
    log,
    maxMessageSize: config.maxMessageSize ?? LIMITS.MAX_MESSAGE_SIZE,
    sendRaw,
  };

  /* Asked for anew, as before a reconnect: the token the frame carries is the current one. */
  const authenticate = (): void => {
    void (async () => {
      try {
        const credentials = await config.credentials?.();
        sendControl(opsCtx, encodeMessage({ type: "auth", payload: credentials?.frame ?? {} }));
      } catch (error) {
        log.warn("The socket's credentials could not be had to send again", error);
      }
    })();
  };

  const lifecycleCtx: LifecycleContext = {
    config,
    state,
    log,
    topics,
    queue,
    silence,
    factory,
    sendRaw,
    authenticate,
    refs,
  };

  if (config.onStatusChange) state.subscribe(config.onStatusChange);
  connect(lifecycleCtx);

  return {
    subscribe: (topic, handler, variables) => subscribeToTopic(opsCtx, topic, handler, variables),
    send: (topic, payload) => sendToTopic(opsCtx, topic, payload),
    authenticate,
    close: () => gracefulClose(lifecycleCtx, opsCtx),
    get status() {
      return state.current;
    },
    onStatusChange: (handler) => state.subscribe(handler),
  };
}

function gracefulClose(lifecycleCtx: LifecycleContext, opsCtx: TopicOpsContext): void {
  lifecycleCtx.refs.closed = true;
  clearReconnectTimer(lifecycleCtx);
  lifecycleCtx.silence.stop();
  opsCtx.topics.endAll(undefined);
  opsCtx.queue.clear();
  lifecycleCtx.refs.ws?.close(1000, "client close");
  lifecycleCtx.refs.ws = null;
  lifecycleCtx.state.set("disconnected");
}

/* The platform's WebSocket, with what its handshake takes headers in where it takes them. */
type HeaderedWebSocket = new (url: string, init?: unknown, options?: unknown) => WSClientSocket;

function defaultFactory(
  url: string,
  protocols?: string[],
  headers?: Readonly<Record<string, string>>,
): WSClientSocket {
  if (headers === undefined) return new WebSocket(url, protocols) as unknown as WSClientSocket;
  const Socket = WebSocket as unknown as HeaderedWebSocket;
  /* React Native takes them third; Node's WebSocket, undici's, in its options. */
  if (isReactNative()) return new Socket(url, protocols, { headers });
  return new Socket(url, { ...(protocols && { protocols }), headers });
}
