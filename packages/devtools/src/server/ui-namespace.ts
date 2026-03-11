/**
 * Socket.IO UI namespace handler — manages devtools UI connections.
 */

import type { Namespace } from "socket.io";
import type { SessionInfo } from "./types";
import { handlePlayground } from "./ui-playground-handler";
import { handleReplay } from "./ui-replay-handler";

export function setupUiNamespace(
  appNamespace: Namespace,
  uiNamespace: Namespace,
  sessions: Map<string, SessionInfo>,
): void {
  uiNamespace.on("connection", (socket) => {
    socket.emit("sessions", Array.from(sessions.values()));
    socket.on("replay", handleReplay(appNamespace));
    socket.on("playground:send", handlePlayground(appNamespace));
  });
}
