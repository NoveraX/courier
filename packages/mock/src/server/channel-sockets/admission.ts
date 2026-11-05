import { logger } from "@noverax/courier";
import {
  authOkFrame,
  closeWithNotice,
  type HeartbeatConfig,
  readFirstFrame,
  type SessionClose,
  WS_CODE,
  WS_DEFAULTS,
  type WSMessage,
} from "@noverax/courier/internal";
import type { WebSocket as NodeWebSocket } from "ws";
import { frameHeaders } from "./credentials";
import { sendFrame, sendRefusal } from "./frames";
import type { ChannelSocket } from "./types";

/** How often a mock pings a socket, and how long it waits for the pong: what its `auth_ok` says. */
export interface SocketHeartbeat {
  readonly intervalMs: number;
  readonly timeoutMs: number;
}

/* The sockets whose client was let in: one closed says why in `disconnect`, any other in `auth_error`. */
const admitted = new WeakSet<NodeWebSocket>();

/**
 * Let a socket in on its first frame, as a Courier server does: an `auth`
 * of the protocol's version, its headers taken over the handshake's,
 * answered with `auth_ok`. Any other first frame — another version's, or
 * one no client sends — closes the socket and says why. A mock asks for no
 * credentials: what the frame carries only reaches the mocks.
 *
 * @param socket - The socket
 * @param raw - Its first frame
 * @param heartbeat - What the mock pings it by
 * @returns Whether it was let in
 * @example
 * ```ts
 * if (admitSocket(socket, String(raw), heartbeat)) alive = keepAlive(ws, heartbeat);
 * ```
 */
export function admitSocket(
  socket: ChannelSocket,
  raw: string,
  heartbeat: SocketHeartbeat,
): boolean {
  const first = readFirstFrame(raw, WS_DEFAULTS.maxMessageSize);
  if ("refused" in first) {
    closeWithNotice(socket.ws, first.refused, false);
    return false;
  }
  const { id } = first.auth;
  const headers = frameHeaders(socket, first.auth);
  if (headers === undefined) {
    closeWithNotice(socket.ws, { kind: "bad-auth-frame", id }, false);
    return false;
  }
  socket.headers = headers;
  admitted.add(socket.ws);
  sendFrame(socket.ws, admission(socket, id, heartbeat));
  return true;
}

/**
 * Take credentials a client sent again: their headers replace the earlier
 * frame's, and `auth_ok` with the frame's id says so. A frame no client
 * sends is refused, and the socket goes on with the headers it had.
 *
 * @param socket - The socket
 * @param message - The `auth` frame
 * @param heartbeat - What the mock pings it by
 * @example
 * ```ts
 * if (message.type === "auth") renewCredentials(socket, message, heartbeat);
 * ```
 */
export function renewCredentials(
  socket: ChannelSocket,
  message: WSMessage,
  heartbeat: SocketHeartbeat,
): void {
  const headers = frameHeaders(socket, message);
  if (headers === undefined) {
    logger.warn("MockWS", `An auth frame no client sends was ignored (${socket.id})`);
    sendRefusal(socket.ws, message, { code: WS_CODE.BAD_REQUEST, message: "Invalid auth frame" });
    return;
  }
  socket.headers = headers;
  sendFrame(socket.ws, admission(socket, message.id, heartbeat));
}

/**
 * Close a socket for why, the frame that says why sent just before the
 * close: `auth_error` while its client was not let in, `disconnect` after.
 *
 * @param ws - The socket
 * @param why - Why it is closed
 * @example
 * ```ts
 * closeSocket(ws, { kind: "shutdown", retryAfterMs: 0 });
 * ```
 */
export function closeSocket(ws: NodeWebSocket, why: SessionClose): void {
  closeWithNotice(ws, why, admitted.has(ws));
}

/**
 * The heartbeat a mock keeps on its sockets: its config's, or a Courier
 * server's own.
 *
 * @param config - The mock's `heartbeat`, if it has one
 * @returns How often it pings, and how long it waits for the pong
 * @example
 * ```ts
 * heartbeatOf({ intervalMs: 5_000 }); // → { intervalMs: 5000, timeoutMs: 10000 }
 * ```
 */
export function heartbeatOf(config: HeartbeatConfig | undefined): SocketHeartbeat {
  return {
    intervalMs: config?.intervalMs ?? WS_DEFAULTS.heartbeatIntervalMs,
    timeoutMs: config?.timeoutMs ?? WS_DEFAULTS.heartbeatTimeoutMs,
  };
}

function admission(
  socket: ChannelSocket,
  id: string | undefined,
  heartbeat: SocketHeartbeat,
): WSMessage {
  const limits = {
    maxMessageSize: WS_DEFAULTS.maxMessageSize,
    maxSubscriptions: WS_DEFAULTS.maxSubscriptions,
  };
  return authOkFrame({ id, connectionId: socket.id, heartbeat, limits });
}
