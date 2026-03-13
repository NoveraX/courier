import { useState, useEffect } from "react"

// ── Session Timer Hook ──────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`
  }
  return `${seconds}s`
}

/**
 * Returns a formatted elapsed time string that ticks every second.
 * Returns null if startedAt is null (no active session).
 */
export function useSessionTimer(startedAt: number | null): string | null {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (startedAt === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  if (startedAt === null) return null
  return formatElapsed(now - startedAt)
}
