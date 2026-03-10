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
  useEffect(() => {
    const s = getSocket()
    const store = useDevToolsStore.getState

    const onConnect = () => store().setConnectionStatus("connected")

    const onDisconnect = () => store().setConnectionStatus("disconnected")

    const onReconnectAttempt = (attempt: number) => {
      store().setConnectionStatus("reconnecting")
      store().setReconnectAttempt(attempt)
    }

    const onReconnect = () => store().setConnectionStatus("connected")

    const onConnectError = () => store().setConnectionStatus("disconnected")

    const onSessions = (sessions: SessionInfo[]) => store().setSessions(sessions)

    const onSessionConnect = (session: SessionInfo) => store().addSession(session)

    const onSessionDisconnect = ({ sessionId }: { sessionId: string }) =>
      store().removeSession(sessionId)

    // biome-ignore lint/suspicious/noExplicitAny: event shape validated inside handleEvent
    const onEvent = (event: any) => store().handleEvent(event)

    s.on("connect", onConnect)
    s.on("disconnect", onDisconnect)
    s.io.on("reconnect_attempt", onReconnectAttempt)
    s.io.on("reconnect", onReconnect)
    s.on("connect_error", onConnectError)
    s.on("sessions", onSessions)
    s.on("session:connect", onSessionConnect)
    s.on("session:disconnect", onSessionDisconnect)
    s.on("event", onEvent)

    return () => {
      s.off("connect", onConnect)
      s.off("disconnect", onDisconnect)
      s.io.off("reconnect_attempt", onReconnectAttempt)
      s.io.off("reconnect", onReconnect)
      s.off("connect_error", onConnectError)
      s.off("sessions", onSessions)
      s.off("session:connect", onSessionConnect)
      s.off("session:disconnect", onSessionDisconnect)
      s.off("event", onEvent)
    }
  }, [])
}
