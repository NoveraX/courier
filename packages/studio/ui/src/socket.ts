import { useEffect, useRef } from "react"
import { io } from "socket.io-client"

import type { Socket } from "socket.io-client"
import type { SessionInfo, CatalogSnapshot } from "./store"
import type { StudioEvent } from "./store/types-events"
import type { ScannedSource, SourceSummary } from "@/views/apis/types"

import { useStudioStore } from "./store"
import { handleMockEvent, isMockEvent } from "./store/handle-mock-events"
import { notifyFileChange } from "./store/watcher-notifications"

function isStudioEvent(value: unknown): value is StudioEvent & Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.id === "string"
    && typeof obj.type === "string"
    && typeof obj.timestamp === "number"
    && typeof obj.sessionId === "string"
}

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

export function useSocketConnection(): void {
  const autoReconnect = useStudioStore((s) => s.settings.autoReconnect)
  const reconnectDelay = useStudioStore((s) => s.settings.reconnectDelay)
  const prevSettings = useRef({ autoReconnect, reconnectDelay })

  useEffect(() => {
    const prev = prevSettings.current
    const changed = prev.autoReconnect !== autoReconnect || prev.reconnectDelay !== reconnectDelay
    prevSettings.current = { autoReconnect, reconnectDelay }

    // Only recreate socket when settings actually changed, not on StrictMode remount
    const s = changed ? recreateSocket() : getSocket()

    const store = useStudioStore.getState
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
  onWatcherStatus: (data: unknown) => void
  onWatcherChange: (data: unknown) => void
}

function buildBindings(
  s: Socket,
  store: typeof useStudioStore.getState,
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
    onEvent: (event) => {
      if (!isStudioEvent(event)) return
      const e = event as StudioEvent & Record<string, unknown>
      if (isMockEvent(e.type)) {
        handleMockEvent(e)
      } else {
        store().handleEvent(e)
      }
    },
    onCatalogSnapshot: (data) => {
      if (data && typeof data === "object" && "catalog" in data) {
        store().setCatalog(data as CatalogSnapshot)
      }
    },
    onScanUpdated: (data) => {
      if (data && typeof data === "object" && "sources" in data) {
        store().setScanSources((data as { sources: ScannedSource[] }).sources)
      }
    },
    onRegistryUpdated: (data) => {
      if (data && typeof data === "object" && "sources" in data) {
        store().setRegistrySources((data as { sources: SourceSummary[] }).sources)
      }
    },
    onWatcherStatus: (data) => {
      if (data && typeof data === "object" && "apiPaths" in data) {
        const d = data as { apiPaths: number; mockFiles: number }
        store().setWatcherStatus(d.apiPaths, d.mockFiles)
      }
    },
    onWatcherChange: (data) => {
      if (data && typeof data === "object" && "source" in data) {
        const d = data as { source: "api" | "mock"; files: string[]; timestamp: number }
        store().setWatcherChange(d)
        notifyFileChange(d.source, d.files, store)
      }
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
  s.on("watcher:status", b.onWatcherStatus)
  s.on("watcher:change", b.onWatcherChange)

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
  s.off("watcher:status", b.onWatcherStatus)
  s.off("watcher:change", b.onWatcherChange)
}
