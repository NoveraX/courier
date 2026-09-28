import { useEffect, useRef } from "react"

import { useStudioStore } from "@/store"
import { getSocket, recreateSocket } from "./socket-instance"
import { bindPlaygroundHistory } from "./playground-history-bindings"
import { buildBindings, unbind } from "./socket-bindings"

export function useSocketConnection(): void {
  const autoReconnect = useStudioStore((s) => s.settings.autoReconnect)
  const reconnectDelay = useStudioStore((s) => s.settings.reconnectDelay)
  const prevSettings = useRef({ autoReconnect, reconnectDelay })

  useEffect(() => {
    const prev = prevSettings.current
    const changed =
      prev.autoReconnect !== autoReconnect ||
      prev.reconnectDelay !== reconnectDelay
    prevSettings.current = { autoReconnect, reconnectDelay }

    // Only recreate socket when settings actually changed, not on StrictMode remount
    const s = changed ? recreateSocket() : getSocket()

    const store = useStudioStore.getState
    const bind = buildBindings(s, store)
    const unbindHistory = bindPlaygroundHistory(s, useStudioStore)

    return () => {
      unbindHistory()
      unbind(s, bind)
    }
  }, [autoReconnect, reconnectDelay])
}
