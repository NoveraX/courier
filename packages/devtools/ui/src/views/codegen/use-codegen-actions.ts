import type { SourceConfig, SourceState } from "./types"
import { fetchParseSpec, fetchGenerateCode, fetchWriteFiles, fetchSaveConfig } from "./api"
import { createDefaultState, groupKey, deriveSourceName } from "./helpers"

interface ActionDeps {
  sources: SourceConfig[]
  states: SourceState[]
  activeSourceIdx: number
  src: SourceConfig
  st: SourceState
  setSources: React.Dispatch<React.SetStateAction<SourceConfig[]>>
  updateState: (patch: Partial<SourceState>) => void
  setStep: (s: "import" | "select" | "options" | "preview") => void
  setLoading: (v: boolean) => void
  setError: (v: string | null) => void
  setWriteResult: (v: string | null) => void
  savedSelectionsRef: React.MutableRefObject<Map<number, Record<string, string[]>>>
}

export function createCodegenActions(deps: ActionDeps) {
  const {
    sources, states, activeSourceIdx, src, st,
    setSources, updateState,
    setStep, setLoading, setError, setWriteResult,
    savedSelectionsRef,
  } = deps

  async function handleSaveConfig() {
    try {
      const serialized: SourceConfig[] = sources.map((s, i) => {
        const state = states[i] ?? createDefaultState()
        const selectedEndpoints: Record<string, string[]> = {}
        for (const [group, endpoints] of Object.entries(state.selection)) {
          if (endpoints.size > 0) selectedEndpoints[group] = [...endpoints]
        }
        return { ...s, options: { ...s.options, selectedEndpoints }, selectedEndpoints }
      })
      await fetchSaveConfig({ sources: serialized })
      setWriteResult("Config saved to codegen.nexus.json")
      setTimeout(() => setWriteResult(null), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config")
    }
  }

  async function handleParse() {
    if (!src.importContent.trim()) return
    setLoading(true)
    setError(null)
    try {
      const parsed = await fetchParseSpec(src.importSource, src.importContent.trim())
      const saved = savedSelectionsRef.current.get(activeSourceIdx)
      const sel: Record<string, Set<string>> = {}
      for (const group of parsed.groups) {
        const key = groupKey(group, parsed.groups.indexOf(group))
        if (saved?.[key]) {
          const validNames = new Set(group.endpoints.map((e) => e.name))
          sel[key] = new Set(saved[key].filter((name) => validNames.has(name)))
        } else {
          sel[key] = new Set()
        }
      }
      savedSelectionsRef.current.delete(activeSourceIdx)
      const derived = deriveSourceName(parsed.title, parsed.baseURL)
      if (src.name === "api" && derived !== "api") {
        setSources((prev) => prev.map((s, i) =>
          i === activeSourceIdx ? { ...s, name: derived, options: { ...s.options, sourceName: derived } } : s
        ))
      }
      updateState({ spec: parsed, selection: sel, files: [], activeFileIndex: 0 })
      setStep("select")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed")
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    if (!st.spec) return
    setLoading(true)
    setError(null)
    try {
      const selectedEndpoints: Record<string, string[]> = {}
      for (const [group, endpoints] of Object.entries(st.selection)) {
        if (endpoints.size > 0) selectedEndpoints[group] = [...endpoints]
      }
      const generated = await fetchGenerateCode(st.spec, { ...src.options, selectedEndpoints })
      updateState({ files: generated, activeFileIndex: 0 })
      setStep("preview")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setLoading(false)
    }
  }

  async function handleWrite() {
    setLoading(true)
    setError(null)
    setWriteResult(null)
    try {
      const result = await fetchWriteFiles(st.files)
      setWriteResult(`${result.written} file${result.written > 1 ? "s" : ""} written`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed")
    } finally {
      setLoading(false)
    }
  }

  function handleCopyAll() {
    const content = st.files.map((f) => `// ${f.path}\n${f.content}`).join("\n\n// ────────────────────────────────────────\n\n")
    navigator.clipboard.writeText(content)
    setWriteResult("Copied to clipboard")
    setTimeout(() => setWriteResult(null), 2000)
  }

  function handleDownload() {
    const content = st.files.map((f) => `// === ${f.path} ===\n\n${f.content}`).join("\n\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${src.options.sourceName}-nexus-api.ts`
    a.click()
    URL.revokeObjectURL(url)
  }

  return { handleSaveConfig, handleParse, handleGenerate, handleWrite, handleCopyAll, handleDownload }
}
