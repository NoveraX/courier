import { useEffect, useRef } from "react"
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

function createSocket(): Socket {
  const { autoReconnect, reconnectDelay } = useDevToolsStore.getState().settings
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

export function useSocketConnection(): void {
  const autoReconnect = useDevToolsStore((s) => s.settings.autoReconnect)
  const reconnectDelay = useDevToolsStore((s) => s.settings.reconnectDelay)
  const prevSettings = useRef({ autoReconnect, reconnectDelay })

  useEffect(() => {
    const prev = prevSettings.current
    const changed = prev.autoReconnect !== autoReconnect || prev.reconnectDelay !== reconnectDelay
    prevSettings.current = { autoReconnect, reconnectDelay }

    // Only recreate socket when settings actually changed, not on StrictMode remount
    const s = changed ? recreateSocket() : getSocket()

    const store = useDevToolsStore.getState
    const bind = buildBindings(s, store)

    return () => unbind(s, bind)
  }, [autoReconnect, reconnectDelay])
}

// ── Event bindings (extracted to keep hook body short) ───────────────────────

interface Bindings {
  onConnect: () => void
  onDisconnect: () => void
  onReconnectAttempt: (attempt: number) => void
  onReconnect: () => void
  onConnectError: () => void
  onSessions: (sessions: SessionInfo[]) => void
  onSessionConnect: (session: SessionInfo) => void
  onSessionDisconnect: (data: { sessionId: string }) => void
  onEvent: (event: unknown) => void
  onCatalogSnapshot: (data: unknown) => void
  onScanUpdated: (data: unknown) => void
  onRegistryUpdated: (data: unknown) => void
}

function buildBindings(
  s: Socket,
  store: typeof useDevToolsStore.getState,
): Bindings {
  const b: Bindings = {
    onConnect: () => store().setConnectionStatus("connected"),
    onDisconnect: () => store().setConnectionStatus("disconnected"),
    onReconnectAttempt: (attempt) => {
      store().setConnectionStatus("reconnecting")
      store().setReconnectAttempt(attempt)
    },
    onReconnect: () => store().setConnectionStatus("connected"),
    onConnectError: () => store().setConnectionStatus("disconnected"),
    onSessions: (sessions) => store().setSessions(sessions),
    onSessionConnect: (session) => store().addSession(session),
    onSessionDisconnect: ({ sessionId }) => store().removeSession(sessionId),
    onEvent: (event) => { if (isDevToolsEvent(event)) store().handleEvent(event) },
    onCatalogSnapshot: (data) => {
      if (data && typeof data === "object" && "catalog" in data) {
        store().setCatalog(data as CatalogSnapshot)
      }
    },
    onScanUpdated: (data) => {
      window.dispatchEvent(new CustomEvent("nexus:scan:updated", { detail: data }))
    },
    onRegistryUpdated: (data) => {
      window.dispatchEvent(new CustomEvent("nexus:registry:updated", { detail: data }))
    },
  }

  s.on("connect", b.onConnect)
  s.on("disconnect", b.onDisconnect)
  s.io.on("reconnect_attempt", b.onReconnectAttempt)
  s.io.on("reconnect", b.onReconnect)
  s.on("connect_error", b.onConnectError)
  s.on("sessions", b.onSessions)
  s.on("session:connect", b.onSessionConnect)
  s.on("session:disconnect", b.onSessionDisconnect)
  s.on("event", b.onEvent)
  s.on("catalog:snapshot", b.onCatalogSnapshot)
  s.on("scan:updated", b.onScanUpdated)
  s.on("registry:updated", b.onRegistryUpdated)

  return b
}

function unbind(s: Socket, b: Bindings): void {
  s.off("connect", b.onConnect)
  s.off("disconnect", b.onDisconnect)
  s.io.off("reconnect_attempt", b.onReconnectAttempt)
  s.io.off("reconnect", b.onReconnect)
  s.off("connect_error", b.onConnectError)
  s.off("sessions", b.onSessions)
  s.off("session:connect", b.onSessionConnect)
  s.off("session:disconnect", b.onSessionDisconnect)
  s.off("event", b.onEvent)
  s.off("catalog:snapshot", b.onCatalogSnapshot)
  s.off("scan:updated", b.onScanUpdated)
  s.off("registry:updated", b.onRegistryUpdated)
}
