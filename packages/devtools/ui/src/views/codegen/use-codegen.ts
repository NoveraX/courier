import { useState, useEffect, useRef, useCallback, useMemo } from "react"

import type { Step, SourceConfig, SourceState } from "./types"
import { fetchParseSpec } from "./api"
import { createDefaultSource, createDefaultState, groupKey } from "./helpers"
import { createCodegenActions } from "./codegen-actions"
import { useSelectionActions } from "./use-selection-actions"

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

  const updateState = useCallback((patch: Partial<SourceState>) => {
    setStates((prev) => prev.map((s, i) => (i === activeSourceIdx ? { ...s, ...patch } : s)))
  }, [activeSourceIdx])

  /* Selection adapter: bridges per-source state with useSelectionActions */
  const setSelection: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>> = useCallback(
    (action) => {
      setStates((prev) => prev.map((s, i) => {
        if (i !== activeSourceIdx) return s
        const next = typeof action === "function" ? action(s.selection) : action
        return { ...s, selection: next }
      }))
    },
    [activeSourceIdx],
  )

  const { toggleGroup, toggleEndpoint, selectAll, deselectAll } = useSelectionActions({
    spec: st.spec,
    setSelection,
  })

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
  }, [src.importContent, src.importSource, st.spec, updateState])

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

  const totalSelected = Object.values(st.selection).reduce((sum, s) => sum + s.size, 0)
  const totalEndpoints = st.spec?.groups.reduce((sum, g) => sum + g.endpoints.length, 0) ?? 0

  const actions = useMemo(() => createCodegenActions({
    activeSourceIdx, src, st,
    setSources, updateState,
    setStep, setLoading, setError, setWriteResult,
    savedSelectionsRef,
  }), [activeSourceIdx, src, st, updateState])

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
