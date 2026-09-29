import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";

import { onTokenArrival, studioToken } from "@/lib/studio-token";
import { useStudioStore } from "@/store";

let socket: Socket | null = null;

function createSocket(): Socket {
  const { autoReconnect, reconnectDelay } = useStudioStore.getState().settings;
  return io("/ui", {
    transports: ["websocket"],
    reconnection: autoReconnect,
    reconnectionDelay: reconnectDelay,
    /* Read at every handshake, so the next one carries a token a link brought since. */
    auth: (send) => send({ token: studioToken() }),
  });
}

/* The handshake carried the page's old token, or none: the socket connects
   again to present the one a link just brought. */
onTokenArrival(() => {
  socket?.disconnect().connect();
});

export function getSocket(): Socket {
  if (!socket) socket = createSocket();
  return socket;
}

/** Tear down current socket and create a fresh one with updated settings */
export function recreateSocket(): Socket {
  if (socket) {
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
  }
  socket = createSocket();
  return socket;
}
