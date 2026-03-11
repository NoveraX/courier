import { useState, useMemo, useCallback, useEffect } from "react"

import type { PlaygroundHistoryEntry } from "../../store"

import { useDevToolsStore } from "../../store"
import { mergeSourceMaps, getDemoSourceMap } from "../explorer/helpers"
import { isValidJson, isValidHeadersJson } from "./helpers"
import { useSendRequest } from "./use-send-request"

export function usePlayground() {
  const {
    sessions,
    connected,
    playgroundHistory,
    playgroundActiveResponse: response,
    setPlaygroundActiveResponse,
    clearPlaygroundHistory,
  } = useDevToolsStore()

  const sourceMap = useMemo(() => {
    const merged = mergeSourceMaps(sessions)
    return Object.keys(merged).length > 0 ? merged : getDemoSourceMap()
  }, [sessions])

  const isUsingDemo = useMemo(
    () => Object.keys(mergeSourceMaps(sessions)).length === 0,
    [sessions]
  )

  const sourceNames = useMemo(() => Object.keys(sourceMap), [sourceMap])

  // Selection state
  const [selectedSource, setSelectedSource] = useState<string>("")
  const [selectedGroup, setSelectedGroup] = useState<string>("")
  const [selectedMethod, setSelectedMethod] = useState<string>("")

  // Request state
  const [variables, setVariables] = useState<string>("{}")
  const [headers, setHeaders] = useState<string>("{}")
  const [mode, setMode] = useState<"direct" | "proxy">("proxy")

  // Response tab
  const [responseTab, setResponseTab] = useState<"body" | "headers" | "timing">("body")

  // Derived data
  const groups = useMemo(() => {
    const src = sourceMap[selectedSource]
    return src ? Object.keys(src.groups) : []
  }, [sourceMap, selectedSource])

  const methods = useMemo(() => {
    const eps = sourceMap[selectedSource]?.groups[selectedGroup]?.endpoints
    return eps ? Object.keys(eps) : []
  }, [sourceMap, selectedSource, selectedGroup])

  const endpointInfo = useMemo(() => {
    if (!selectedMethod) return null
    return sourceMap[selectedSource]?.groups[selectedGroup]?.endpoints[selectedMethod] ?? null
  }, [sourceMap, selectedSource, selectedGroup, selectedMethod])

  // Auto-cascade: when source changes, reset group
  useEffect(() => {
    if (!selectedSource && sourceNames.length > 0) {
      setSelectedSource(sourceNames[0] as string)
      return
    }
    if (selectedSource && groups.length > 0 && !groups.includes(selectedGroup)) {
      setSelectedGroup(groups[0] as string)
    } else if (groups.length === 0) {
      setSelectedGroup("")
    }
  }, [selectedSource, sourceNames, groups, selectedGroup])

  /* Flat API: single group with empty name "" — auto-select it */
  const isFlat = groups.length === 1 && groups[0] === ""

  // Auto-cascade: when group changes, reset method
  useEffect(() => {
    const hasGroup = selectedGroup !== "" || isFlat
    if (hasGroup && methods.length > 0 && !methods.includes(selectedMethod)) {
      setSelectedMethod(methods[0] as string)
    } else if (methods.length === 0) {
      setSelectedMethod("")
    }
  }, [selectedGroup, methods, selectedMethod, isFlat])

  const handleSourceChange = useCallback((source: string) => {
    setSelectedSource(source)
    setSelectedGroup("")
    setSelectedMethod("")
  }, [])

  const handleGroupChange = useCallback((group: string) => {
    setSelectedGroup(group)
    setSelectedMethod("")
  }, [])

  const variablesValid = isValidJson(variables)
  const headersValid = isValidHeadersJson(headers)
  const canSend = !!selectedMethod && variablesValid && headersValid

  const { loading, handleSend } = useSendRequest({
    canSend,
    selectedSource,
    selectedGroup,
    selectedMethod,
    variables,
    headers,
    mode,
  })

  // Load from history
  const loadFromHistory = useCallback(
    (entry: PlaygroundHistoryEntry) => {
      setSelectedSource(entry.source)
      setSelectedGroup(entry.group)
      setSelectedMethod(entry.method)
      setVariables(entry.variables)
      setHeaders(entry.headers)
      setMode(entry.mode)
      setPlaygroundActiveResponse(entry)
    },
    [setPlaygroundActiveResponse]
  )

  return {
    connected,
    isUsingDemo,
    sourceNames,
    selectedSource,
    selectedGroup,
    selectedMethod,
    groups,
    methods,
    endpointInfo,
    variables,
    setVariables,
    headers,
    setHeaders,
    mode,
    setMode,
    loading,
    canSend: canSend && !loading,
    variablesValid,
    headersValid,
    responseTab,
    setResponseTab,
    response,
    playgroundHistory,
    handleSourceChange,
    handleGroupChange,
    setSelectedMethod,
    handleSend,
    loadFromHistory,
    clearPlaygroundHistory,
  }
}
