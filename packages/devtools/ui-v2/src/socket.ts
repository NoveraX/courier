import { useEffect } from "react"
import { io } from "socket.io-client"

import type { Socket } from "socket.io-client"
import type { SessionInfo, CatalogSnapshot } from "./store"
import type { DevToolsEvent } from "./store/types-events"

import { useDevToolsStore } from "./store"

function isDevToolsEvent(value: unknown): value is DevToolsEvent & Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.id === "string"
    && typeof obj.type === "string"
    && typeof obj.timestamp === "number"
    && typeof obj.sessionId === "string"
}

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

export function useSocketConnection(): void {
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

    const onEvent = (event: unknown) => {
      if (isDevToolsEvent(event)) store().handleEvent(event)
    }

    const onCatalogSnapshot = (data: unknown) => {
      if (data && typeof data === "object" && "catalog" in data) {
        store().setCatalog(data as CatalogSnapshot)
      }
    }

    s.on("connect", onConnect)
    s.on("disconnect", onDisconnect)
    s.io.on("reconnect_attempt", onReconnectAttempt)
    s.io.on("reconnect", onReconnect)
    s.on("connect_error", onConnectError)
    s.on("sessions", onSessions)
    s.on("session:connect", onSessionConnect)
    s.on("session:disconnect", onSessionDisconnect)
    s.on("event", onEvent)
    s.on("catalog:snapshot", onCatalogSnapshot)

    /* File watcher events — forwarded to custom event listeners */
    const onScanUpdated = (data: unknown) => {
      window.dispatchEvent(new CustomEvent("nexus:scan:updated", { detail: data }))
    }
    const onRegistryUpdated = (data: unknown) => {
      window.dispatchEvent(new CustomEvent("nexus:registry:updated", { detail: data }))
    }

    s.on("scan:updated", onScanUpdated)
    s.on("registry:updated", onRegistryUpdated)

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
      s.off("catalog:snapshot", onCatalogSnapshot)
      s.off("scan:updated", onScanUpdated)
      s.off("registry:updated", onRegistryUpdated)
    }
  }, [])
}
