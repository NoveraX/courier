import { closeWithNotice, createHeartbeat, encodeMessage } from "@noverax/courier/internal";
import type { WebSocket as NodeWebSocket } from "ws";
import type { SocketHeartbeat } from "./channel-sockets/admission";

/** What a socket kept alive is told: that the client answered a ping. */
export interface KeepAlive {
  receivedPong(): void;
}

/**
 * Keep a mock's socket alive as a Courier server does, once it has let the
 * client in: a `ping` frame every interval, and the socket closed — the
 * frame that says why before the close — when no `pong` answers it within
 * the timeout. A Courier client takes a socket silent for both together for
 * dead and reconnects, so a quiet channel on a mock that sent nothing was
 * dropped and opened again.
 *
 * @param ws - The socket, its client let in
 * @param heartbeat - How often to ping, and how long to wait for the pong
 * @returns What to tell of each `pong` the client sends
 * @example
 * ```ts
 * const alive = keepAlive(ws, { intervalMs: 25_000, timeoutMs: 10_000 });
 * ws.on("message", (raw) => { if (decodeMessage(String(raw)).type === "pong") alive.receivedPong(); });
 * ```
 */
export function keepAlive(ws: NodeWebSocket, heartbeat: SocketHeartbeat): KeepAlive {
  const beat = createHeartbeat(
    () => {
      if (ws.readyState === ws.OPEN) ws.send(encodeMessage({ type: "ping" }));
    },
    () => closeWithNotice(ws, { kind: "heartbeat-timeout" }, true),
    heartbeat,
  );
  beat.start();
  ws.once("close", () => beat.stop());
  return beat;
}
