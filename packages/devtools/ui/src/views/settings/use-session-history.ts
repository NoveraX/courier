import { useState, useEffect, useCallback } from "react"

// ── Types ──────────────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string
  name: string
  savedAt: number
  startedAt: number
  duration: number
  stats: {
    totalRequests: number
    successCount: number
    errorCount: number
    avgDuration: number
    totalSize: number
  }
  appCount: number
}

// ── API helpers ────────────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json" }

async function fetchHistory(): Promise<SessionSummary[]> {
  const res = await fetch("/api/sessions/list", { method: "POST", headers: JSON_HEADERS, body: "{}" })
  if (!res.ok) return []
  return res.json() as Promise<SessionSummary[]>
}

async function deleteSessionApi(id: string): Promise<boolean> {
  const res = await fetch("/api/sessions/delete", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ id }),
  })
  return res.ok
}

async function saveSessionApi(
  requests: unknown[],
  apps: unknown[],
  name?: string,
): Promise<{ id: string; name: string } | null> {
  const res = await fetch("/api/sessions/save", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ requests, apps, name }),
  })
  if (!res.ok) return null
  return res.json() as Promise<{ id: string; name: string }>
}

async function exportSession(id: string, format: string): Promise<void> {
  const res = await fetch("/api/sessions/export", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ id, format }),
  })
  if (!res.ok) return

  const blob = await res.blob()
  const ext = format === "postman" ? "postman_collection.json" : format === "har" ? "har" : "json"
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `session-${id}.${ext}`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSessionHistory() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const list = await fetchHistory()
    setSessions(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const remove = useCallback(
    async (id: string) => {
      const ok = await deleteSessionApi(id)
      if (ok) setSessions((prev) => prev.filter((s) => s.id !== id))
      return ok
    },
    [],
  )

  const save = useCallback(
    async (requests: unknown[], apps: unknown[], name?: string) => {
      const result = await saveSessionApi(requests, apps, name)
      if (result) await refresh()
      return result
    },
    [refresh],
  )

  return { sessions, loading, refresh, remove, save, exportSession }
}
