import type { ScopedLogger } from "../../logger";
import { calculateBackoff } from "../backoff";
import type { ConnectionState } from "../connection-state";
import { fromErrorCode, type RealtimeError } from "../errors";
import { answerAuthRequired } from "./auth-refresh";
import { resolveAuthUrl } from "./auth-url";
import type { createMessageQueue } from "./message-queue";
import { shouldReconnect } from "./reconnect-classifier";
import type { ServerSilenceDetector } from "./server-silence";
import { requestSubscription } from "./topic-operations";
import type { TopicRegistry } from "./topic-registry-types";
import { dispatchIncomingMessage } from "./ws-message-handler";
import type { createPendingRegistry } from "./ws-pending";
import { decodeMessage, type WSMessage } from "./ws-protocol";
import type { WSClientSocket, WSConnectionConfig } from "./ws-types";

/**
 * Mutable per-connection state shared between lifecycle handlers.
 *
 * Encapsulating it as an object lets the open/message/close handlers live
 * in their own module while keeping the original closure semantics intact.
 * `ws` and `attempt` are reassigned across reconnect cycles, so they
 * cannot be passed by value.
 */
export interface LifecycleContext {
  config: WSConnectionConfig;
  state: ConnectionState;
  log: ScopedLogger;
  topics: TopicRegistry;
  queue: ReturnType<typeof createMessageQueue>;
  pending: ReturnType<typeof createPendingRegistry>;
  silence: ServerSilenceDetector;
  factory: (url: string, protocols?: string[]) => WSClientSocket;
  sendRaw(data: string): boolean;
  refreshToken(token: string): void;
  /** Mutable refs — handlers reassign these */
  refs: {
    ws: WSClientSocket | null;
    attempt: number;
    closed: boolean;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
  };
}

/** The close code of a socket closed over a frame larger than the server reads. */
const MESSAGE_TOO_BIG = 1009;

/** What handling a closed socket reads of its close event. */
type SocketClosure = Pick<CloseEvent, "code" | "reason">;

/** Open the underlying socket and wire lifecycle handlers */
export function connect(ctx: LifecycleContext): void {
  if (ctx.refs.closed) return;
  ctx.state.set("connecting");
  const maybeUrl = resolveAuthUrl(ctx.config.url, ctx.config.getAuthToken);
  if (typeof maybeUrl === "string") openSocket(ctx, maybeUrl);
  else void maybeUrl.then((url) => openSocket(ctx, url));
}

function openSocket(ctx: LifecycleContext, url: string): void {
  if (ctx.refs.closed) return;
  const ws = ctx.factory(url, ctx.config.protocols);
  ctx.refs.ws = ws;
  ws.onopen = () => handleOpen(ctx);
  ws.onmessage = (ev) => handleMessage(ctx, ev);
  ws.onclose = (ev) => handleClose(ctx, ev);
  ws.onerror = () => {
    /* onclose always fires after onerror */
  };
}

function handleOpen(ctx: LifecycleContext): void {
  clearReconnectTimer(ctx);
  ctx.state.set("connected");
  ctx.silence.start();
  for (const entry of ctx.topics.entries()) {
    requestSubscription(ctx, entry.qualifiedTopic, entry.variables);
  }
  for (const msg of ctx.queue.drain()) ctx.sendRaw(msg);
}

function handleMessage(ctx: LifecycleContext, ev: MessageEvent): void {
  ctx.silence.reset();
  /* The backoff starts over once the server has answered on the socket, not
     as soon as it opens: a server that accepts the upgrade and closes at
     once kept every reconnect at the first, shortest delay. */
  ctx.refs.attempt = 0;
  let msg: WSMessage;
  try {
    msg = decodeMessage(String(ev.data));
  } catch {
    ctx.log.warn("Invalid WS message received");
    return;
  }
  dispatchIncomingMessage(
    {
      log: ctx.log,
      topics: ctx.topics,
      pending: ctx.pending,
      sendRaw: ctx.sendRaw,
      onAuthRequired: () => answerAuthRequired(ctx),
    },
    msg,
  );
}

/**
 * Give up on the socket without waiting for its close handshake, and go on
 * as if it had closed. A server that has gone silent does not answer the
 * handshake either, so the socket's close event never came and the
 * connection stayed "connected" to nothing.
 *
 * @param ctx - The connection's lifecycle state
 * @param code - The close code to record, and to send should the frame get through
 * @param reason - Why the socket was given up on
 */
export function dropSocket(ctx: LifecycleContext, code: number, reason: string): void {
  const ws = ctx.refs.ws;
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
  ws.close(code, reason);
  handleClose(ctx, { code, reason });
}

function handleClose(ctx: LifecycleContext, ev: SocketClosure): void {
  ctx.silence.stop();
  ctx.refs.ws = null;
  /* The next socket subscribes afresh: what is sent meanwhile waits for it. */
  ctx.topics.unconfirmAll();
  if (ctx.refs.closed || !shouldReconnect(ev.code)) {
    ctx.state.set("disconnected");
    ctx.pending.rejectAll("Connection lost");
    /* Refused for good — too many connections, origin, auth: every
       subscription hears why instead of waiting on a socket that is gone. */
    if (!ctx.refs.closed) ctx.topics.endAll(closeFailure(ev));
    return;
  }
  if (ev.code === MESSAGE_TOO_BIG) tellOfOversizedMessage(ctx, ev);
  ctx.state.set("reconnecting");
  clearReconnectTimer(ctx);
  const delay = calculateBackoff(ctx.refs.attempt++, ctx.config.backoff);
  ctx.log.info(`Reconnecting in ${delay}ms (attempt ${ctx.refs.attempt})`);
  ctx.refs.reconnectTimer = setTimeout(() => connect(ctx), delay);
}

/**
 * The server closed the socket over one message larger than it reads. That
 * message is gone and the rest may go on, so the connection reconnects —
 * it used to end every subscription on it — and each subscription hears
 * why its socket closed under it.
 */
function tellOfOversizedMessage(ctx: LifecycleContext, ev: SocketClosure): void {
  const error = fromErrorCode(
    MESSAGE_TOO_BIG,
    ev.reason || "A message was too large for the server",
  );
  ctx.log.warn(`The server closed the connection over a message too large: ${error.message}`);
  for (const topic of ctx.topics.topics()) ctx.topics.fail(topic, error);
}

/** Why a socket closed for good, as its subscriptions read it; none for a normal close. */
function closeFailure(ev: SocketClosure): RealtimeError | undefined {
  if (ev.code === 1000) return undefined;
  return fromErrorCode(ev.code, ev.reason || "Connection closed");
}

export function clearReconnectTimer(ctx: LifecycleContext): void {
  if (ctx.refs.reconnectTimer !== null) {
    clearTimeout(ctx.refs.reconnectTimer);
    ctx.refs.reconnectTimer = null;
  }
}
