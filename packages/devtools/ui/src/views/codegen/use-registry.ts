import { useCallback, useEffect, useState } from "react"

import type { SourceStatusInfo, SourceSummary, UpdateContext } from "./types"
import {
  fetchCheckAllUpdates,
  fetchCheckUpdates,
  fetchRegistrySources,
  fetchRemoveSource,
} from "./api"

interface UseRegistryReturn {
  sources: SourceSummary[]
  statuses: Record<string, SourceStatusInfo>
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  checkUpdates: (name: string) => Promise<UpdateContext | null>
  checkAll: () => Promise<void>
  removeSource: (name: string) => Promise<void>
}

export function useRegistry(): UseRegistryReturn {
  const [sources, setSources] = useState<SourceSummary[]>([])
  const [statuses, setStatuses] = useState<Record<string, SourceStatusInfo>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await fetchRegistrySources()
      setSources(list)
      setStatuses((prev) => {
        const next: Record<string, SourceStatusInfo> = {}
        for (const s of list) {
          next[s.name] = prev[s.name] ?? { status: "up-to-date" }
        }
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load registry")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const checkUpdates = useCallback(async (name: string): Promise<UpdateContext | null> => {
    setStatuses((prev) => ({ ...prev, [name]: { status: "checking" } }))
    try {
      const result = await fetchCheckUpdates(name)
      if (result.error) {
        setStatuses((prev) => ({ ...prev, [name]: { status: "error", error: result.error } }))
        return null
      }
      const status = result.changed ? "updates-available" : "up-to-date"
      setStatuses((prev) => ({ ...prev, [name]: { status } }))

      if (result.changed && result.diff && result.newSpec) {
        return { sourceName: name, diff: result.diff, newSpec: result.newSpec }
      }
      return null
    } catch (err) {
      setStatuses((prev) => ({
        ...prev,
        [name]: { status: "error", error: err instanceof Error ? err.message : "Check failed" },
      }))
      return null
    }
  }, [])

  const checkAll = useCallback(async () => {
    const urlSources = sources.filter((s) => s.specSource.type === "url")
    if (urlSources.length === 0) return

    for (const s of urlSources) {
      setStatuses((prev) => ({ ...prev, [s.name]: { status: "checking" } }))
    }

    try {
      const results = await fetchCheckAllUpdates()
      setStatuses((prev) => {
        const next = { ...prev }
        for (const [name, result] of Object.entries(results)) {
          next[name] = result.error
            ? { status: "error", error: result.error }
            : { status: result.changed ? "updates-available" : "up-to-date" }
        }
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check updates")
    }
  }, [sources])

  const remove = useCallback(async (name: string) => {
    try {
      await fetchRemoveSource(name)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove source")
    }
  }, [refresh])

  return { sources, statuses, loading, error, refresh, checkUpdates, checkAll, removeSource: remove }
}
