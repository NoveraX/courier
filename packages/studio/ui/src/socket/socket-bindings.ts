import type { Socket } from "socket.io-client"
import type { ScannedSource, SourceSummary } from "@/views/apis/types"
import type { useStudioStore } from "@/store"
import type { StudioEvent } from "@/store/types-events"

import { handleMockEvent, isMockEvent } from "@/store/handle-mock-events"
import { notifyFileChange } from "@/store/watcher-notifications"
import { showBindingErrorToast } from "@/store/binding-error-toast"
import { isBindingErrorPayload, isBindingSnapshot } from "./binding-guards"
import { isStudioEvent } from "./event-guards"
import {
  isPlaygroundChunkPayload,
  isPlaygroundEndPayload,
  isPlaygroundErrorPayload,
} from "./playground-guards"

export interface Bindings {
  onConnect: () => void
  onDisconnect: () => void
  onReconnectAttempt: (attempt: number) => void
  onReconnect: () => void
  onConnectError: () => void
  onEvent: (event: unknown) => void
  onBindingSnapshot: (data: unknown) => void
  onBindingError: (data: unknown) => void
  onRegistryUpdated: (data: unknown) => void
  onScanSources: (data: unknown) => void
  onWatcherStatus: (data: unknown) => void
  onWatcherChange: (data: unknown) => void
  onPlaygroundChunk: (data: unknown) => void
  onPlaygroundEnd: (data: unknown) => void
  onPlaygroundError: (data: unknown) => void
}

export function buildBindings(
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
    onEvent: (event) => {
      if (!isStudioEvent(event)) return
      const e = event as StudioEvent & Record<string, unknown>
      if (isMockEvent(e.type)) {
        handleMockEvent(e)
      } else {
        store().handleEvent(e)
      }
    },
    onBindingSnapshot: (data) => {
      if (!isBindingSnapshot(data)) return
      store().setBindingSnapshot(data)
    },
    onBindingError: (data) => {
      if (!isBindingErrorPayload(data)) return
      store().setBindingError(data)
      showBindingErrorToast(data)
    },
    onRegistryUpdated: (data) => {
      if (data && typeof data === "object" && "sources" in data) {
        store().setRegistrySources(
          (data as { sources: SourceSummary[] }).sources,
        )
      }
    },
    onScanSources: (data) => {
      if (!data || typeof data !== "object" || !("sources" in data)) return
      const sources = (data as { sources: unknown }).sources
      if (!Array.isArray(sources)) return
      store().setScanSources(sources as ScannedSource[])
    },
    onWatcherStatus: (data) => {
      if (data && typeof data === "object" && "apiPaths" in data) {
        const d = data as { apiPaths: number; mockFiles: number }
        store().setWatcherStatus(d.apiPaths, d.mockFiles)
      }
    },
    onWatcherChange: (data) => {
      if (data && typeof data === "object" && "source" in data) {
        const d = data as {
          source: "api" | "mock"
          files: string[]
          timestamp: number
        }
        store().setWatcherChange(d)
        notifyFileChange(d.source, d.files, store)
      }
    },
    onPlaygroundChunk: (data) => {
      if (!isPlaygroundChunkPayload(data)) return
      store().appendPlaygroundChunk(data.rid, data.chunk)
    },
    onPlaygroundEnd: (data) => {
      if (!isPlaygroundEndPayload(data)) return
      store().endPlayground(data.rid, data.summary)
    },
    onPlaygroundError: (data) => {
      if (!isPlaygroundErrorPayload(data)) return
      store().errorPlayground(data.rid, data.error)
    },
  }

  s.on("connect", b.onConnect)
  s.on("disconnect", b.onDisconnect)
  s.io.on("reconnect_attempt", b.onReconnectAttempt)
  s.io.on("reconnect", b.onReconnect)
  s.on("connect_error", b.onConnectError)
  s.on("event", b.onEvent)
  s.on("binding:snapshot", b.onBindingSnapshot)
  s.on("binding:error", b.onBindingError)
  s.on("registry:updated", b.onRegistryUpdated)
  s.on("scan:sources", b.onScanSources)
  s.on("watcher:status", b.onWatcherStatus)
  s.on("watcher:change", b.onWatcherChange)
  s.on("playground:chunk", b.onPlaygroundChunk)
  s.on("playground:end", b.onPlaygroundEnd)
  s.on("playground:error", b.onPlaygroundError)

  return b
}

export function unbind(s: Socket, b: Bindings): void {
  s.off("connect", b.onConnect)
  s.off("disconnect", b.onDisconnect)
  s.io.off("reconnect_attempt", b.onReconnectAttempt)
  s.io.off("reconnect", b.onReconnect)
  s.off("connect_error", b.onConnectError)
  s.off("event", b.onEvent)
  s.off("binding:snapshot", b.onBindingSnapshot)
  s.off("binding:error", b.onBindingError)
  s.off("registry:updated", b.onRegistryUpdated)
  s.off("scan:sources", b.onScanSources)
  s.off("watcher:status", b.onWatcherStatus)
  s.off("watcher:change", b.onWatcherChange)
  s.off("playground:chunk", b.onPlaygroundChunk)
  s.off("playground:end", b.onPlaygroundEnd)
  s.off("playground:error", b.onPlaygroundError)
}

