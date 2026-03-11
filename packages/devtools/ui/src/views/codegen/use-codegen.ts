import { useState, useEffect, useRef, useCallback, useMemo } from "react"

import type { Step, SourceConfig, SourceState } from "./types"
import { fetchParseSpec } from "./api"
import { createDefaultSource, createDefaultState, groupKey } from "./helpers"
import { createCodegenActions } from "./use-codegen-actions"

export function useCodegen() {
  const [sources, setSources] = useState<SourceConfig[]>([createDefaultSource()])
  const [states, setStates] = useState<SourceState[]>([createDefaultState()])
  const [activeSourceIdx, setActiveSourceIdx] = useState(0)

  const [step, setStep] = useState<Step>("import")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [writeResult, setWriteResult] = useState<string | null>(null)
  const [watching, setWatching] = useState(false)
  const [watchDiff, setWatchDiff] = useState<string | null>(null)
  const watchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const savedSelectionsRef = useRef<Map<number, Record<string, string[]>>>(new Map())

  const src = sources[activeSourceIdx] ?? createDefaultSource()
  const st = states[activeSourceIdx] ?? createDefaultState()

  function updateSource(patch: Partial<SourceConfig>) {
    setSources((prev) => prev.map((s, i) => (i === activeSourceIdx ? { ...s, ...patch } : s)))
  }

  function updateState(patch: Partial<SourceState>) {
    setStates((prev) => prev.map((s, i) => (i === activeSourceIdx ? { ...s, ...patch } : s)))
  }

  const groupKeys = useMemo(() => {
    if (!st.spec) return new Map()
    const map = new Map()
    st.spec.groups.forEach((g, i) => map.set(g, groupKey(g, i)))
    return map
  }, [st.spec])

  // Watch mode
  useEffect(() => {
    return () => { if (watchIntervalRef.current) clearInterval(watchIntervalRef.current) }
  }, [])

  const checkForChanges = useCallback(async () => {
    if (!src.importContent.trim() || src.importSource !== "url") return
    try {
      const newSpec = await fetchParseSpec("url", src.importContent.trim())
      const oldJson = JSON.stringify(st.spec?.groups.map((g) => ({ name: g.name, endpoints: g.endpoints.length })))
      const newJson = JSON.stringify(newSpec.groups.map((g) => ({ name: g.name, endpoints: g.endpoints.length })))
      if (oldJson !== newJson) {
        const added = newSpec.groups.reduce((s, g) => s + g.endpoints.length, 0) -
          (st.spec?.groups.reduce((s, g) => s + g.endpoints.length, 0) ?? 0)
        setWatchDiff(`Spec changed: ${added >= 0 ? `+${added}` : added} endpoints`)
        updateState({ prevSpec: st.spec, spec: newSpec })
      }
    } catch { /* Silently ignore watch errors */ }
  }, [src.importContent, src.importSource, st.spec])

  function toggleWatch() {
    if (watching) {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current)
      watchIntervalRef.current = null
      setWatching(false)
      setWatchDiff(null)
    } else {
      setWatching(true)
      setWatchDiff(null)
      watchIntervalRef.current = setInterval(checkForChanges, 10_000)
    }
  }

  // Source management
  function addSource() {
    const name = `api${sources.length + 1}`
    setSources((prev) => [...prev, createDefaultSource(name)])
    setStates((prev) => [...prev, createDefaultState()])
    setActiveSourceIdx(sources.length)
    setStep("import")
    setError(null)
    setWriteResult(null)
  }

  function removeSource(idx: number) {
    if (sources.length <= 1) return
    setSources((prev) => prev.filter((_, i) => i !== idx))
    setStates((prev) => prev.filter((_, i) => i !== idx))
    savedSelectionsRef.current.delete(idx)
    if (activeSourceIdx >= idx && activeSourceIdx > 0) setActiveSourceIdx(activeSourceIdx - 1)
    setStep("import")
  }

  function switchSource(idx: number) {
    if (idx === activeSourceIdx) return
    if (watching) {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current)
      watchIntervalRef.current = null
      setWatching(false)
      setWatchDiff(null)
    }
    setActiveSourceIdx(idx)
    setError(null)
    setWriteResult(null)
    const targetState = states[idx]
    if (targetState?.files?.length) setStep("preview")
    else if (targetState?.spec) setStep("select")
    else setStep("import")
  }

  // Selection helpers
  function toggleGroup(gKey: string) {
    const group = st.spec?.groups.find((g, i) => groupKey(g, i) === gKey)
    if (!group) return
    const current = st.selection[gKey] ?? new Set()
    const next = { ...st.selection }
    next[gKey] = current.size === group.endpoints.length
      ? new Set()
      : new Set(group.endpoints.map((e) => e.name))
    updateState({ selection: next })
  }

  function toggleEndpoint(gKey: string, endpointName: string) {
    const next = { ...st.selection }
    const current = new Set(st.selection[gKey] ?? [])
    if (current.has(endpointName)) current.delete(endpointName)
    else current.add(endpointName)
    next[gKey] = current
    updateState({ selection: next })
  }

  function selectAll() {
    if (!st.spec) return
    const sel: Record<string, Set<string>> = {}
    st.spec.groups.forEach((group, i) => { sel[groupKey(group, i)] = new Set(group.endpoints.map((e) => e.name)) })
    updateState({ selection: sel })
  }

  function deselectAll() {
    if (!st.spec) return
    const sel: Record<string, Set<string>> = {}
    st.spec.groups.forEach((group, i) => { sel[groupKey(group, i)] = new Set() })
    updateState({ selection: sel })
  }

  const totalSelected = Object.values(st.selection).reduce((sum, s) => sum + s.size, 0)
  const totalEndpoints = st.spec?.groups.reduce((sum, g) => sum + g.endpoints.length, 0) ?? 0

  const actions = createCodegenActions({
    activeSourceIdx, src, st,
    setSources, updateState,
    setStep, setLoading, setError, setWriteResult,
    savedSelectionsRef,
  })

  return {
    sources, states, activeSourceIdx, src, st,
    step, setStep, loading, error, setError,
    writeResult, watching, watchDiff, setWatchDiff,
    groupKeys, totalSelected, totalEndpoints,
    updateSource, updateState,
    toggleWatch, addSource, removeSource, switchSource,
    toggleGroup, toggleEndpoint, selectAll, deselectAll,
    ...actions,
  }
}
