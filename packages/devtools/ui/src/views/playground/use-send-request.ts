import { useCallback, useEffect, useRef, useState } from "react"

import type { PlaygroundHistoryEntry, RequestEntry } from "../../store"

import { useDevToolsStore } from "../../store"
import { getSocket } from "../../socket"

export function useSendRequest({
  canSend,
  selectedSource,
  selectedGroup,
  selectedMethod,
  variables,
  headers,
  mode,
}: {
  canSend: boolean
  selectedSource: string
  selectedGroup: string
  selectedMethod: string
  variables: string
  headers: string
  mode: "direct" | "proxy"
}) {
  const { addPlaygroundEntry, updatePlaygroundEntry } = useDevToolsStore()
  const [loading, setLoading] = useState(false)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingIdRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleSend = useCallback(() => {
    if (!canSend || !selectedSource || !selectedGroup || !selectedMethod) return

    const parsedVars: unknown = JSON.parse(variables)
    const parsedHeaders = JSON.parse(headers) as Record<string, string>

    const entry: PlaygroundHistoryEntry = {
      id: crypto.randomUUID(),
      source: selectedSource,
      group: selectedGroup,
      method: selectedMethod,
      variables,
      headers,
      mode,
      timestamp: Date.now(),
      status: "pending",
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    pendingIdRef.current = entry.id

    setLoading(true)
    addPlaygroundEntry(entry)

    const socket = getSocket()
    socket.emit(
      "playground:send",
      {
        source: selectedSource,
        group: selectedGroup,
        method: selectedMethod,
        variables: parsedVars,
        headers: parsedHeaders,
        mode,
      },
      (result: {
        status: number
        data: unknown
        headers: Record<string, string>
        timing: RequestEntry["timing"]
        error?: string
        duration: number
      }) => {
        if (pendingIdRef.current !== entry.id) return

        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = null
        pendingIdRef.current = null

        updatePlaygroundEntry(entry.id, {
          status: result.error ? "error" : "success",
          statusCode: result.status,
          duration: result.duration,
          response: result.error ?? result.data,
          responseHeaders: result.headers,
          timing: result.timing,
        })
        setLoading(false)
      }
    )

    timeoutRef.current = setTimeout(() => {
      if (pendingIdRef.current !== entry.id) return
      pendingIdRef.current = null
      timeoutRef.current = null

      updatePlaygroundEntry(entry.id, {
        status: "error",
        response: "Request timed out (30s)",
      })
      setLoading(false)
    }, 30_000)
  }, [
    canSend,
    selectedSource,
    selectedGroup,
    selectedMethod,
    variables,
    headers,
    mode,
    addPlaygroundEntry,
    updatePlaygroundEntry,
  ])

  // Keyboard shortcut: Cmd/Ctrl+Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        handleSend()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSend])

  return { loading, handleSend }
}
