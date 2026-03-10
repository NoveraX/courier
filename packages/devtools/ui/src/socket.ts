import { useEffect } from "react"
import { io } from "socket.io-client"

import type { Socket } from "socket.io-client"
import type { SessionInfo } from "./store"

import { useDevToolsStore } from "./store"

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io("/ui", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
    })
  }
  return socket
}

export function useSocketConnection() {
  const { setConnected, setSessions, addSession, removeSession, handleEvent } =
    useDevToolsStore()

  useEffect(() => {
    const s = getSocket()

    s.on("connect", () => setConnected(true))
    s.on("disconnect", () => setConnected(false))
    s.on("sessions", (sessions: SessionInfo[]) => setSessions(sessions))
    s.on("session:connect", (session: SessionInfo) => addSession(session))
    s.on("session:disconnect", ({ sessionId }: { sessionId: string }) =>
      removeSession(sessionId),
    )
    s.on("event", handleEvent)

    s.connect()

    return () => {
      s.off("connect")
      s.off("disconnect")
      s.off("sessions")
      s.off("session:connect")
      s.off("session:disconnect")
      s.off("event")
    }
  }, [setConnected, setSessions, addSession, removeSession, handleEvent])
}
