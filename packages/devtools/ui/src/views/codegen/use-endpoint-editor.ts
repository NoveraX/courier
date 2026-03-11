import { useState, useMemo, useCallback, useEffect } from "react"

import type { ParsedGroup, ParsedSpec, SourceSummary } from "./types"
import { fetchParseSpec, fetchGenerateCode, fetchWriteFiles } from "./api"
import { formatWriteResult, groupKey } from "./helpers"

export function useEndpointEditor(source: SourceSummary, onApplied: () => void) {
  const [spec, setSpec] = useState<ParsedSpec | null>(null)
  const [selection, setSelection] = useState<Record<string, Set<string>>>({})
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const loadSpec = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const parsed = await fetchParseSpec(source.specSource.type, source.specSource.value)
      setSpec(parsed)
      setSelection(buildSelectionFromOptions(parsed, source.options.selectedEndpoints))
      setExpandedGroups(new Set(parsed.groups.map((g, i) => groupKey(g, i))))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spec")
    } finally {
      setLoading(false)
    }
  }, [source])

  /* Load spec on first render */
  useEffect(() => { loadSpec() }, [])

  const groupKeys = useMemo(() => {
    if (!spec) return new Map<ParsedGroup, string>()
    const map = new Map<ParsedGroup, string>()
    spec.groups.forEach((g, i) => map.set(g, groupKey(g, i)))
    return map
  }, [spec])

  const filteredGroups = useMemo(() => {
    if (!spec) return []
    if (!search.trim()) return spec.groups
    const q = search.toLowerCase()
    return spec.groups
      .map((g) => ({
        ...g,
        endpoints: g.endpoints.filter((e) =>
          e.name.toLowerCase().includes(q)
          || e.fullPath.toLowerCase().includes(q)
          || e.httpMethod.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.endpoints.length > 0 || g.name.toLowerCase().includes(q))
  }, [spec, search])

  const { totalSelected, totalEndpoints, removedCount } = useMemo(() => {
    if (!spec) return { totalSelected: 0, totalEndpoints: 0, removedCount: 0 }
    let selected = 0
    let total = 0
    let removed = 0
    const prev = source.options.selectedEndpoints
    for (const group of spec.groups) {
      const gKey = groupKeys.get(group) ?? group.name
      total += group.endpoints.length
      selected += selection[gKey]?.size ?? 0
      /* Count previously selected endpoints that are now deselected */
      if (prev) {
        const prevSet = new Set(prev[gKey] ?? [])
        const curSet = selection[gKey] ?? new Set()
        for (const name of prevSet) {
          if (!curSet.has(name)) removed++
        }
      }
    }
    return { totalSelected: selected, totalEndpoints: total, removedCount: removed }
  }, [spec, selection, groupKeys, source.options.selectedEndpoints])

  const toggleGroup = useCallback((gKey: string) => {
    if (!spec) return
    const group = spec.groups.find((g, i) => groupKey(g, i) === gKey)
    if (!group) return
    setSelection((prev) => {
      const current = prev[gKey] ?? new Set()
      const allSelected = current.size === group.endpoints.length
      return { ...prev, [gKey]: allSelected ? new Set() : new Set(group.endpoints.map((e) => e.name)) }
    })
  }, [spec])

  const toggleEndpoint = useCallback((gKey: string, name: string) => {
    setSelection((prev) => {
      const current = new Set(prev[gKey] ?? [])
      if (current.has(name)) current.delete(name)
      else current.add(name)
      return { ...prev, [gKey]: current }
    })
  }, [])

  const toggleExpand = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    if (!spec) return
    const sel: Record<string, Set<string>> = {}
    spec.groups.forEach((g, i) => {
      sel[groupKey(g, i)] = new Set(g.endpoints.map((e) => e.name))
    })
    setSelection(sel)
  }, [spec])

  const deselectAll = useCallback(() => setSelection({}), [])

  const handleApply = useCallback(async () => {
    if (!spec || totalSelected === 0) return
    setApplying(true)
    setError(null)
    setResult(null)
    try {
      const selectedEndpoints: Record<string, string[]> = {}
      for (const [gKey, endpoints] of Object.entries(selection)) {
        if (endpoints.size > 0) selectedEndpoints[gKey] = [...endpoints]
      }
      const opts = { ...source.options, selectedEndpoints }
      const files = await fetchGenerateCode(spec, opts)
      const writeResult = await fetchWriteFiles(files, {
        sourceName: source.name,
        spec,
        specSource: source.specSource,
        options: opts,
      })
      setResult(formatWriteResult(writeResult))
      onApplied()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed")
    } finally {
      setApplying(false)
    }
  }, [spec, selection, totalSelected, source, onApplied])

  return {
    spec, loading, applying, error, result, search,
    selection, expandedGroups, groupKeys, filteredGroups,
    totalSelected, totalEndpoints, removedCount,
    setSearch, toggleGroup, toggleEndpoint, toggleExpand,
    selectAll, deselectAll, handleApply,
  }
}

function buildSelectionFromOptions(
  spec: ParsedSpec,
  selectedEndpoints: Record<string, string[]> | null,
): Record<string, Set<string>> {
  const sel: Record<string, Set<string>> = {}
  if (!selectedEndpoints) {
    /* null = all endpoints were selected */
    spec.groups.forEach((g, i) => {
      sel[groupKey(g, i)] = new Set(g.endpoints.map((e) => e.name))
    })
    return sel
  }
  for (const [gKey, names] of Object.entries(selectedEndpoints)) {
    sel[gKey] = new Set(names)
  }
  return sel
}
