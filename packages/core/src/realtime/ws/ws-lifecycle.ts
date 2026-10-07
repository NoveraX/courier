import type { ScopedLogger } from "../../logger";
import { calculateBackoff } from "../backoff";
import type { ConnectionState } from "../connection-state";
import { answerAuthRequired } from "./auth-refresh";
import { closeFailure, MESSAGE_TOO_BIG, tellOfOversizedMessage } from "./close-failure";
import type { createMessageQueue } from "./message-queue";
import { shouldReconnect } from "./reconnect-classifier";
import type { ServerSilenceDetector } from "./server-silence";
import { requestSubscription } from "./topic-operations";
import type { TopicRegistry } from "./topic-registry-types";
import type { WSAuthFrame, WSCredentials } from "./ws-credentials";
import { dispatchIncomingMessage } from "./ws-message-handler";
import { decodeMessage, encodeMessage, type WSMessage } from "./ws-protocol";
import type {
  WSClientSocket,
  WSCloseEventLike,
  WSConnectionConfig,
  WSMessageEventLike,
  WSSocketFactory,
} from "./ws-types";

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
  silence: ServerSilenceDetector;
  factory: WSSocketFactory;
  sendRaw(data: string): boolean;
  /** Send the socket's credentials again, asked for anew */
  authenticate(): void;
  /** Mutable refs — handlers reassign these */
  refs: {
    ws: WSClientSocket | null;
    /** The frame the open socket proves who it is with */
    frame: WSAuthFrame | undefined;
    attempt: number;
    closed: boolean;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
  };
}

/** What handling a closed socket reads of its close event. */
type SocketClosure = WSCloseEventLike;

/**
 * Open the underlying socket and wire lifecycle handlers. Its credentials
 * are asked for first, so the frame that proves who it is with goes out as
 * soon as it opens; credentials that cannot be had are tried for again, as
 * a dropped socket is reopened.
 */
export function connect(ctx: LifecycleContext): void {
  if (ctx.refs.closed) return;
  ctx.state.set("connecting");
  let credentials: WSCredentials | Promise<WSCredentials> | undefined;
  try {
    credentials = ctx.config.credentials?.();
  } catch (error) {
    credentialsFailed(ctx, error);
    return;
  }
  if (!(credentials instanceof Promise)) {
    openSocket(ctx, credentials);
    return;
  }
  credentials.then(
    (found) => openSocket(ctx, found),
    (error: unknown) => credentialsFailed(ctx, error),
  );
}

function credentialsFailed(ctx: LifecycleContext, error: unknown): void {
  if (ctx.refs.closed) return;
  ctx.log.warn("The socket's credentials could not be had; trying again", error);
  scheduleReconnect(ctx);
}

function openSocket(ctx: LifecycleContext, credentials: WSCredentials | undefined): void {
  if (ctx.refs.closed) return;
  ctx.refs.frame = credentials?.frame;
  const ws = ctx.factory(ctx.config.url, ctx.config.protocols, credentials?.handshake);
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
  /* Before anything else, whether it carries credentials or not: the server
     admits the connection on it, holding what follows until it has. */
  ctx.sendRaw(encodeMessage({ type: "auth", payload: ctx.refs.frame ?? {} }));
  ctx.state.set("connected");
  ctx.silence.start();
  for (const entry of ctx.topics.entries()) {
    requestSubscription(ctx, entry.qualifiedTopic, entry.variables);
  }
  for (const msg of ctx.queue.drain()) ctx.sendRaw(msg);
}

function handleMessage(ctx: LifecycleContext, ev: WSMessageEventLike): void {
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
    /* Refused for good — too many connections, origin, auth: every
       subscription hears why instead of waiting on a socket that is gone. */
    if (!ctx.refs.closed) ctx.topics.endAll(closeFailure(ev));
    return;
  }
  if (ev.code === MESSAGE_TOO_BIG) tellOfOversizedMessage(ctx.topics, ctx.log, ev);
  scheduleReconnect(ctx);
}

function scheduleReconnect(ctx: LifecycleContext): void {
  ctx.state.set("reconnecting");
  /* Whoever heard of the drop may have closed the connection for good. */
  if (ctx.refs.closed) return;
  clearReconnectTimer(ctx);
  const delay = calculateBackoff(ctx.refs.attempt++, ctx.config.backoff);
  ctx.log.info(`Reconnecting in ${delay}ms (attempt ${ctx.refs.attempt})`);
  ctx.refs.reconnectTimer = setTimeout(() => connect(ctx), delay);
}

export function clearReconnectTimer(ctx: LifecycleContext): void {
  if (ctx.refs.reconnectTimer !== null) {
    clearTimeout(ctx.refs.reconnectTimer);
    ctx.refs.reconnectTimer = null;
  }
}
