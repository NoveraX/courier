import { createHeartbeat, encodeMessage, type HeartbeatConfig } from "@noverax/courier/internal";
import type { WebSocket as NodeWebSocket } from "ws";

/** What a socket kept alive is told: that the client answered a ping. */
export interface KeepAlive {
  receivedPong(): void;
}

/**
 * Keep a mock's socket alive as a Courier server does: a `ping` frame every
 * 25 seconds, and the socket closed with 4408 when no `pong` answers it
 * within 10. A Courier client takes 35 seconds without a frame for a dead
 * server and reconnects, so a quiet channel on a mock that sent none was
 * dropped and opened again every 35 seconds.
 *
 * @param ws - The socket, open
 * @param config - How often to ping, and how long to wait for the pong
 * @returns What to tell of each `pong` the client sends
 * @example
 * ```ts
 * const alive = keepAlive(ws);
 * ws.on("message", (raw) => { if (decodeMessage(String(raw)).type === "pong") alive.receivedPong(); });
 * ```
 */
export function keepAlive(ws: NodeWebSocket, config?: HeartbeatConfig): KeepAlive {
  const heartbeat = createHeartbeat(
    () => {
      if (ws.readyState === ws.OPEN) ws.send(encodeMessage({ type: "ping" }));
    },
    () => ws.close(4408, "Heartbeat timeout"),
    config,
  );
  heartbeat.start();
  ws.once("close", () => heartbeat.stop());
  return heartbeat;
}
