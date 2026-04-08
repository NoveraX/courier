import { io } from "socket.io-client"

import type { Socket } from "socket.io-client"

import { useStudioStore } from "@/store"

let socket: Socket | null = null

function createSocket(): Socket {
  const { autoReconnect, reconnectDelay } = useStudioStore.getState().settings
  return io("/ui", {
    transports: ["websocket"],
    reconnection: autoReconnect,
    reconnectionDelay: reconnectDelay,
  })
}

export function getSocket(): Socket {
  if (!socket) socket = createSocket()
  return socket
}

/** Tear down current socket and create a fresh one with updated settings */
export function recreateSocket(): Socket {
  if (socket) {
    socket.removeAllListeners()
    socket.io.removeAllListeners()
    socket.disconnect()
  }
  socket = createSocket()
  return socket
}
