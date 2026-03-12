import { useCallback, useEffect, useState } from "react"

import type { ScannedSource, SourceStatusInfo, SourceSummary, UpdateContext } from "./types"
import {
  fetchCheckAllUpdates,
  fetchCheckUpdates,
  fetchRegistrySources,
  fetchRemoveSource,
} from "./api-registry";
import { fetchScanProject } from "./api-scanner";

interface UseRegistryReturn {
  sources: SourceSummary[]
  scannedSources: ScannedSource[]
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
  const [scannedSources, setScannedSources] = useState<ScannedSource[]>([])
  const [statuses, setStatuses] = useState<Record<string, SourceStatusInfo>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, scan] = await Promise.all([
        fetchRegistrySources(),
        fetchScanProject().catch(() => ({ sources: [], scannedFiles: 0 })),
      ])
      setSources(list)
      /* Only show hand-written sources (not already imported) */
      const importedNames = new Set(list.map((s) => s.name))
      setScannedSources(scan.sources.filter((s) => !s.isImported && !importedNames.has(s.name)))
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

  /* Hot reload: auto-refresh when files change on disk (debounced 300ms) */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void refresh() }, 300)
    }
    window.addEventListener("nexus:scan:updated", handler)
    window.addEventListener("nexus:registry:updated", handler)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener("nexus:scan:updated", handler)
      window.removeEventListener("nexus:registry:updated", handler)
    }
  }, [refresh])

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

      if (result.changed && result.newSpec) {
        return { sourceName: name, newSpec: result.newSpec }
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
    if (sources.length === 0) return

    for (const s of sources) {
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

  return { sources, scannedSources, statuses, loading, error, refresh, checkUpdates, checkAll, removeSource: remove }
}
