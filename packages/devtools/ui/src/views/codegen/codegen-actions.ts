import { fetchGenerateCode, fetchParseSpec, fetchWriteFiles } from "./api"
import { deriveSourceName, formatWriteResult, groupKey } from "./helpers"
import { buildSelectedEndpoints } from "./selection-helpers"
import type { ParsedGroup, SourceConfig, SourceState } from "./types"

interface ActionDeps {
  activeSourceIdx: number
  src: SourceConfig
  st: SourceState
  setSources: React.Dispatch<React.SetStateAction<SourceConfig[]>>
  updateState: (patch: Partial<SourceState>) => void
  setStep: (s: "import" | "select" | "options" | "preview") => void
  setLoading: (v: boolean) => void
  setError: (v: string | null) => void
  setWriteResult: (v: string | null) => void
  savedSelectionsRef: React.RefObject<Map<number, Record<string, string[]>>>
}

export function createCodegenActions(deps: ActionDeps) {
  const {
    activeSourceIdx, src, st,
    setSources, updateState,
    setStep, setLoading, setError, setWriteResult,
    savedSelectionsRef,
  } = deps

  async function handleParse() {
    if (!src.importContent.trim()) return
    setLoading(true)
    setError(null)
    try {
      const parsed = await fetchParseSpec(src.importSource, src.importContent.trim())
      const sel = restoreSelections(parsed, savedSelectionsRef.current.get(activeSourceIdx))
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
      const selectedEndpoints = buildSelectedEndpoints(st.selection)
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
      const selectedEndpoints = buildSelectedEndpoints(st.selection)

      const specUrl = src.importSource === "url" ? src.importContent.trim() : ""
      const ctx = st.spec ? {
        sourceName: src.name,
        spec: st.spec,
        specUrl,
        importType: src.importSource,
        options: { ...src.options, selectedEndpoints },
      } : undefined

      const result = await fetchWriteFiles(st.files, ctx)
      setWriteResult(formatWriteResult(result))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed")
    } finally {
      setLoading(false)
    }
  }

  async function handleCopyAll() {
    const content = st.files.map((f) => `// ${f.path}\n${f.content}`).join("\n\n// ────────────────────────────────────────\n\n")
    try {
      await navigator.clipboard.writeText(content)
      setWriteResult("Copied to clipboard")
    } catch {
      setError("Clipboard access denied (requires HTTPS)")
    }
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
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return { handleParse, handleGenerate, handleWrite, handleCopyAll, handleDownload }
}

/** Restore previously saved selections, filtering to valid endpoint names */
function restoreSelections(
  parsed: { groups: { name: string; prefix: string; endpoints: { name: string }[] }[] },
  saved: Record<string, string[]> | undefined,
): Record<string, Set<string>> {
  const sel: Record<string, Set<string>> = {}
  for (const [idx, group] of parsed.groups.entries()) {
    const key = groupKey(group as ParsedGroup, idx)
    if (saved?.[key]) {
      const validNames = new Set(group.endpoints.map((e) => e.name))
      sel[key] = new Set(saved[key].filter((name) => validNames.has(name)))
    } else {
      sel[key] = new Set()
    }
  }
  return sel
}
