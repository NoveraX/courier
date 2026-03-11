import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
  Code,
  Upload,
  Link,
  FileText,
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  Download,
  FolderOpen,
  Loader2,
  AlertCircle,
  Save,
  RefreshCw,
  Eye,
  Search,
  Minus,
  X,
  Plus,
  Trash2,
} from "lucide-react"
import { Badge } from "../../components/ui"
import { DisconnectedBanner } from "../../components/ui"
import { useDevToolsStore } from "../../store"

// ── Types ────────────────────────────────────────────────────────────────────

interface ParsedSpec {
  title: string
  version: string
  description: string
  baseURL: string
  format: string
  groups: ParsedGroup[]
  schemas: Record<string, unknown>
}

interface ParsedGroup {
  name: string
  description: string
  prefix: string
  endpoints: ParsedEndpoint[]
}

interface ParsedEndpoint {
  name: string
  operationId: string | null
  httpMethod: string
  path: string
  fullPath: string
  description: string
  secured: boolean
  tags: string[]
}

interface GenerateOptions {
  sourceName: string
  outputDir: string
  validation: "zod" | "valibot" | "arktype" | "none"
  groupBy: "tag" | "path" | "single"
  naming: "camelCase" | "as-is"
  generateTypes: boolean
  generateSchemas: boolean
  addAuthMiddleware: boolean
  includeComments: boolean
  generateClient: "direct" | "proxy" | "both" | "none"
  selectedEndpoints: Record<string, string[]> | null
}

interface GeneratedFile {
  path: string
  content: string
}

type ImportSource = "url" | "raw" | "file"
type Step = "import" | "select" | "options" | "preview"

/** Per-source state persisted in config */
interface SourceConfig {
  name: string
  importSource: ImportSource
  importContent: string
  options: GenerateOptions
  selectedEndpoints: Record<string, string[]>
}

/** Multi-source config file format */
interface CodegenMultiConfig {
  sources: SourceConfig[]
}

const HTTP_METHOD_COLORS: Record<string, string> = {
  get: "text-emerald-400",
  post: "text-amber-400",
  put: "text-sky-400",
  patch: "text-indigo-400",
  delete: "text-red-400",
}

const DEFAULT_OPTIONS: GenerateOptions = {
  sourceName: "api",
  outputDir: "src/api",
  validation: "zod",
  groupBy: "tag",
  naming: "camelCase",
  generateTypes: true,
  generateSchemas: true,
  addAuthMiddleware: true,
  includeComments: true,
  generateClient: "direct",
  selectedEndpoints: null,
}

// ── API helpers ──────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.DEV ? "http://localhost:4380" : ""

async function fetchParseSpec(source: ImportSource, content: string): Promise<ParsedSpec> {
  const res = await fetch(`${API_BASE}/api/codegen/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, content }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to parse spec")
  return data as ParsedSpec
}

async function fetchGenerateCode(spec: ParsedSpec, options: GenerateOptions): Promise<GeneratedFile[]> {
  const res = await fetch(`${API_BASE}/api/codegen/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spec, options }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Code generation failed")
  return data.files as GeneratedFile[]
}

async function fetchWriteFiles(files: GeneratedFile[]): Promise<{ written: number }> {
  const res = await fetch(`${API_BASE}/api/codegen/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to write files")
  return data as { written: number }
}

async function fetchSaveConfig(config: CodegenMultiConfig): Promise<{ path: string }> {
  const res = await fetch(`${API_BASE}/api/codegen/save-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to save config")
  return data as { path: string }
}

async function fetchLoadConfig(): Promise<CodegenMultiConfig | null> {
  const res = await fetch(`${API_BASE}/api/codegen/load-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  if (res.status === 404) return null
  const data = await res.json()
  if (!res.ok) return null
  return data as CodegenMultiConfig
}

function createDefaultSource(name = "api"): SourceConfig {
  return {
    name,
    importSource: "url",
    importContent: "",
    options: { ...DEFAULT_OPTIONS, sourceName: name, outputDir: "src/api" },
    selectedEndpoints: {},
  }
}

// ── Unique group key helper ──────────────────────────────────────────────────

/** Generate a stable unique key for a group (handles empty/duplicate names). */
function groupKey(group: ParsedGroup, index: number): string {
  if (group.name) return group.name
  // Fallback for groups with no name: use prefix + index
  return `__group_${index}_${group.prefix.replace(/[^a-zA-Z0-9]/g, "_")}`
}

/** Derive a camelCase source name from the spec title and/or baseURL. */
function deriveSourceName(title: string, baseURL?: string): string {
  const cleaned = title
    .replace(/\b(api|service|platform|cloud|public|private|rest|restful|v\d+(\.\d+)*)\b/gi, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
  if (cleaned) {
    const words = cleaned.split(/\s+/).filter(Boolean)
    if (words.length > 0) {
      const parts = words.slice(0, 2)
      const result = parts.map((w, i) => {
        const lower = w.toLowerCase()
        return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
      }).join("")
      if (result) return result
    }
  }
  // Fallback: extract domain name from baseURL
  if (baseURL) {
    try {
      const hostname = new URL(baseURL).hostname
      const parts = hostname.split(".")
      const meaningful = parts.filter((p) => !["api", "www", "com", "org", "net", "io", "dev", "cloud", "app"].includes(p))
      if (meaningful.length > 0 && meaningful[0]) return meaningful[0].toLowerCase()
    } catch { /* not a valid URL */ }
  }
  return "api"
}

// ── Main View ────────────────────────────────────────────────────────────────

/** Per-source runtime state (not persisted) */
interface SourceState {
  spec: ParsedSpec | null
  prevSpec: ParsedSpec | null
  selection: Record<string, Set<string>>
  files: GeneratedFile[]
  activeFileIndex: number
}

function createDefaultState(): SourceState {
  return { spec: null, prevSpec: null, selection: {}, files: [], activeFileIndex: 0 }
}

export function CodegenView() {
  const { connectionStatus } = useDevToolsStore()

  // ── Multi-source state ──────────────────────────────────────────────────────
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

  // Saved selection from config (restored after parsing)
  const savedSelectionsRef = useRef<Map<number, Record<string, string[]>>>(new Map())

  // Current source + state accessors
  const src = sources[activeSourceIdx] ?? createDefaultSource()
  const st = states[activeSourceIdx] ?? createDefaultState()

  function updateSource(patch: Partial<SourceConfig>) {
    setSources((prev) => prev.map((s, i) => (i === activeSourceIdx ? { ...s, ...patch } : s)))
  }

  function updateState(patch: Partial<SourceState>) {
    setStates((prev) => prev.map((s, i) => (i === activeSourceIdx ? { ...s, ...patch } : s)))
  }

  // Build stable group keys map
  const groupKeys = useMemo(() => {
    if (!st.spec) return new Map<ParsedGroup, string>()
    const map = new Map<ParsedGroup, string>()
    st.spec.groups.forEach((g, i) => map.set(g, groupKey(g, i)))
    return map
  }, [st.spec])

  // ── Load saved config on mount ─────────────────────────────────────────────

  useEffect(() => {
    fetchLoadConfig().then((config) => {
      if (!config?.sources?.length) return
      setSources(config.sources)
      setStates(config.sources.map(() => createDefaultState()))
      // Store saved selections for each source
      config.sources.forEach((s, i) => {
        if (s.selectedEndpoints && Object.keys(s.selectedEndpoints).length > 0) {
          savedSelectionsRef.current.set(i, s.selectedEndpoints)
        }
      })
    })
  }, [])

  // ── Watch mode cleanup ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current)
    }
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
    } catch {
      // Silently ignore watch errors
    }
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

  // ── Source management ──────────────────────────────────────────────────────

  function addSource() {
    const idx = sources.length + 1
    const name = `api${idx}`
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
    if (activeSourceIdx >= idx && activeSourceIdx > 0) {
      setActiveSourceIdx(activeSourceIdx - 1)
    }
    setStep("import")
  }

  function switchSource(idx: number) {
    if (idx === activeSourceIdx) return
    // Stop watching when switching
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

  // ── Save config ────────────────────────────────────────────────────────────

  async function handleSaveConfig() {
    try {
      // Serialize all sources with current selections
      const serialized: SourceConfig[] = sources.map((s, i) => {
        const state = states[i] ?? createDefaultState()
        const selectedEndpoints: Record<string, string[]> = {}
        for (const [group, endpoints] of Object.entries(state.selection)) {
          if (endpoints.size > 0) selectedEndpoints[group] = [...endpoints]
        }
        return {
          ...s,
          options: { ...s.options, selectedEndpoints },
          selectedEndpoints,
        }
      })
      await fetchSaveConfig({ sources: serialized })
      setWriteResult("Config saved to codegen.nexus.json")
      setTimeout(() => setWriteResult(null), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config")
    }
  }

  // ── Parse spec ─────────────────────────────────────────────────────────────

  async function handleParse() {
    if (!src.importContent.trim()) return
    setLoading(true)
    setError(null)
    try {
      const parsed = await fetchParseSpec(src.importSource, src.importContent.trim())

      // Restore saved selection or start with none selected
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

      // Auto-detect source name from spec title (only if still default)
      const derived = deriveSourceName(parsed.title, parsed.baseURL)
      if (src.name === "api" && derived !== "api") {
        setSources((prev) => prev.map((s, i) =>
          i === activeSourceIdx
            ? { ...s, name: derived, options: { ...s.options, sourceName: derived } }
            : s,
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

  // ── Generate ───────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!st.spec) return
    setLoading(true)
    setError(null)
    try {
      const selectedEndpoints: Record<string, string[]> = {}
      for (const [group, endpoints] of Object.entries(st.selection)) {
        if (endpoints.size > 0) {
          selectedEndpoints[group] = [...endpoints]
        }
      }

      const generated = await fetchGenerateCode(st.spec, {
        ...src.options,
        selectedEndpoints,
      })
      updateState({ files: generated, activeFileIndex: 0 })
      setStep("preview")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setLoading(false)
    }
  }

  // ── Write to disk ──────────────────────────────────────────────────────────

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

  // ── Copy all files ─────────────────────────────────────────────────────────

  function handleCopyAll() {
    const content = st.files
      .map((f) => `// ${f.path}\n${f.content}`)
      .join("\n\n// ────────────────────────────────────────\n\n")
    navigator.clipboard.writeText(content)
    setWriteResult("Copied to clipboard")
    setTimeout(() => setWriteResult(null), 2000)
  }

  // ── Download ───────────────────────────────────────────────────────────────

  function handleDownload() {
    const content = st.files
      .map((f) => `// === ${f.path} ===\n\n${f.content}`)
      .join("\n\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${src.options.sourceName}-nexus-api.ts`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Selection helpers ──────────────────────────────────────────────────────

  function toggleGroup(gKey: string) {
    const group = st.spec?.groups.find((g, i) => groupKey(g, i) === gKey)
    if (!group) return

    updateState({
      selection: (() => {
        const next = { ...st.selection }
        const current = st.selection[gKey] ?? new Set()
        if (current.size === group.endpoints.length) {
          next[gKey] = new Set()
        } else {
          next[gKey] = new Set(group.endpoints.map((e) => e.name))
        }
        return next
      })(),
    })
  }

  function toggleEndpoint(gKey: string, endpointName: string) {
    updateState({
      selection: (() => {
        const next = { ...st.selection }
        const current = new Set(st.selection[gKey] ?? [])
        if (current.has(endpointName)) {
          current.delete(endpointName)
        } else {
          current.add(endpointName)
        }
        next[gKey] = current
        return next
      })(),
    })
  }

  function selectAll() {
    if (!st.spec) return
    const sel: Record<string, Set<string>> = {}
    st.spec.groups.forEach((group, i) => {
      sel[groupKey(group, i)] = new Set(group.endpoints.map((e) => e.name))
    })
    updateState({ selection: sel })
  }

  function deselectAll() {
    if (!st.spec) return
    const sel: Record<string, Set<string>> = {}
    st.spec.groups.forEach((group, i) => {
      sel[groupKey(group, i)] = new Set()
    })
    updateState({ selection: sel })
  }

  const totalSelected = Object.values(st.selection).reduce((sum, s) => sum + s.size, 0)
  const totalEndpoints = st.spec?.groups.reduce((sum, g) => sum + g.endpoints.length, 0) ?? 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {connectionStatus === "disconnected" && <DisconnectedBanner />}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Code size={16} className="text-text-muted" />
          <span className="text-sm font-medium">Codegen</span>
          {st.spec && (
            <span className="text-xs text-text-muted">
              {st.spec.title} v{st.spec.version}
            </span>
          )}
        </div>

        {/* Actions + Step indicator */}
        <div className="flex items-center gap-2">
          {/* Watch mode toggle (only for URL imports with a parsed spec) */}
          {st.spec && src.importSource === "url" && (
            <button
              type="button"
              onClick={toggleWatch}
              title={watching ? "Stop watching for spec changes" : "Watch spec URL for changes (10s interval)"}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                watching
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Eye size={12} className={watching ? "animate-pulse" : ""} />
              {watching ? "Watching" : "Watch"}
            </button>
          )}

          {/* Save config */}
          {sources.some((_, i) => states[i]?.spec) && (
            <button
              type="button"
              onClick={handleSaveConfig}
              title="Save codegen config as codegen.nexus.json"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
            >
              <Save size={12} />
              Save Config
            </button>
          )}

          <div className="mx-1 h-4 w-px bg-border-subtle" />

          {(["import", "select", "options", "preview"] as Step[]).map((s, i) => (
            <button
              key={s}
              type="button"
              disabled={
                (s === "select" && !st.spec) ||
                (s === "options" && !st.spec) ||
                (s === "preview" && st.files.length === 0)
              }
              onClick={() => setStep(s)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                step === s
                  ? "bg-indigo-500/15 text-indigo-400"
                  : "text-text-muted hover:text-text-secondary disabled:opacity-30"
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                step === s ? "bg-indigo-500 text-white" : "bg-surface-2 text-text-muted"
              }`}>
                {i + 1}
              </span>
              <span className="hidden sm:inline">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Source tabs */}
      <div className="flex items-center gap-1 border-b border-border-default bg-surface-0 px-3 py-1.5">
        {sources.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => switchSource(i)}
            className={`group flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
              i === activeSourceIdx
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                : "text-text-muted hover:text-text-secondary border border-transparent hover:border-border-subtle"
            }`}
          >
            <span className="font-medium">{s.name}</span>
            {states[i]?.spec && (
              <span className="text-[10px] text-text-muted">
                {states[i].spec!.groups.reduce((sum, g) => sum + g.endpoints.length, 0)}ep
              </span>
            )}
            {sources.length > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeSource(i) }}
                className="ml-0.5 hidden rounded p-0.5 text-text-muted hover:bg-red-500/15 hover:text-red-400 group-hover:block"
                title="Remove source"
              >
                <Trash2 size={10} />
              </button>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={addSource}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary hover:bg-surface-1"
          title="Add API source"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {/* Error bar */}
      {error && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400">
            Dismiss
          </button>
        </div>
      )}

      {/* Watch diff banner */}
      {watchDiff && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
          <RefreshCw size={14} />
          <span>{watchDiff}</span>
          {st.prevSpec && (
            <span className="text-text-muted">
              (was {st.prevSpec.groups.reduce((s, g) => s + g.endpoints.length, 0)} endpoints,
              now {st.spec?.groups.reduce((s, g) => s + g.endpoints.length, 0) ?? 0})
            </span>
          )}
          <button
            type="button"
            onClick={() => { setWatchDiff(null); setStep("select") }}
            className="ml-auto rounded bg-amber-500/20 px-2 py-0.5 text-amber-300 hover:bg-amber-500/30"
          >
            Review Changes
          </button>
          <button
            type="button"
            onClick={() => setWatchDiff(null)}
            className="text-amber-400/60 hover:text-amber-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {step === "import" && (
          <ImportStep
            source={src.importSource}
            content={src.importContent}
            loading={loading}
            onSourceChange={(v) => updateSource({ importSource: v })}
            onContentChange={(v) => updateSource({ importContent: v })}
            onParse={handleParse}
          />
        )}

        {step === "select" && st.spec && (
          <SelectStep
            spec={st.spec}
            selection={st.selection}
            totalSelected={totalSelected}
            totalEndpoints={totalEndpoints}
            options={src.options}
            groupKeys={groupKeys}
            onToggleGroup={toggleGroup}
            onToggleEndpoint={toggleEndpoint}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onOptionsChange={(o) => updateSource({ name: o.sourceName, options: o })}
            onNext={() => setStep("options")}
          />
        )}

        {step === "options" && st.spec && (
          <OptionsStep
            options={src.options}
            loading={loading}
            onOptionsChange={(o) => updateSource({ options: o })}
            onGenerate={handleGenerate}
          />
        )}

        {step === "preview" && st.files.length > 0 && (
          <PreviewStep
            files={st.files}
            activeFileIndex={st.activeFileIndex}
            loading={loading}
            writeResult={writeResult}
            onFileSelect={(i) => updateState({ activeFileIndex: i })}
            onWrite={handleWrite}
            onCopy={handleCopyAll}
            onDownload={handleDownload}
          />
        )}
      </div>
    </div>
  )
}

// ── Step 1: Import ───────────────────────────────────────────────────────────

function ImportStep({
  source,
  content,
  loading,
  onSourceChange,
  onContentChange,
  onParse,
}: {
  source: ImportSource
  content: string
  loading: boolean
  onSourceChange: (s: ImportSource) => void
  onContentChange: (c: string) => void
  onParse: () => void
}) {
  const sources: { id: ImportSource; icon: typeof Link; label: string; placeholder: string }[] = [
    { id: "url", icon: Link, label: "URL", placeholder: "https://api.example.com/openapi.json" },
    { id: "file", icon: FolderOpen, label: "File Path", placeholder: "./specs/openapi.yaml" },
    { id: "raw", icon: FileText, label: "Paste", placeholder: "Paste OpenAPI JSON/YAML or Postman Collection here..." },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-medium">Import API Specification</h2>
        <p className="text-xs text-text-muted">
          Supports OpenAPI 3.x (JSON/YAML), Swagger 2.0, and Postman Collections.
        </p>
      </div>

      {/* Source selector */}
      <div className="flex gap-2">
        {sources.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSourceChange(id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors ${
              source === id
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                : "bg-surface-1 text-text-muted hover:text-text-secondary border border-border-subtle"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Input */}
      {source === "raw" ? (
        <textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder={sources.find((s) => s.id === source)?.placeholder}
          className="h-64 w-full resize-none rounded-lg border border-border-default bg-surface-1 px-3 py-2 font-mono text-xs text-text-primary placeholder-text-muted focus:border-indigo-500/50 focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder={sources.find((s) => s.id === source)?.placeholder}
          onKeyDown={(e) => e.key === "Enter" && onParse()}
          className="w-full rounded-lg border border-border-default bg-surface-1 px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:border-indigo-500/50 focus:outline-none"
        />
      )}

      {/* Parse button */}
      <button
        type="button"
        onClick={onParse}
        disabled={loading || !content.trim()}
        className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {loading ? "Parsing..." : "Fetch & Parse"}
      </button>
    </div>
  )
}

// ── Step 2: Select Endpoints ─────────────────────────────────────────────────

function SelectStep({
  spec,
  selection,
  totalSelected,
  totalEndpoints,
  options,
  groupKeys,
  onToggleGroup,
  onToggleEndpoint,
  onSelectAll,
  onDeselectAll,
  onOptionsChange,
  onNext,
}: {
  spec: ParsedSpec
  selection: Record<string, Set<string>>
  totalSelected: number
  totalEndpoints: number
  options: GenerateOptions
  groupKeys: Map<ParsedGroup, string>
  onToggleGroup: (gKey: string) => void
  onToggleEndpoint: (gKey: string, e: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onOptionsChange: (o: GenerateOptions) => void
  onNext: () => void
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const [search, setSearch] = useState("")

  const searchLower = search.toLowerCase()

  // Filter groups/endpoints by search
  const filteredGroups = useMemo(() => {
    if (!searchLower) return spec.groups
    return spec.groups
      .map((group) => ({
        ...group,
        endpoints: group.endpoints.filter(
          (ep) =>
            ep.name.toLowerCase().includes(searchLower) ||
            ep.fullPath.toLowerCase().includes(searchLower) ||
            ep.description.toLowerCase().includes(searchLower) ||
            ep.httpMethod.toLowerCase().includes(searchLower),
        ),
      }))
      .filter((g) => g.endpoints.length > 0 || g.name.toLowerCase().includes(searchLower))
  }, [spec.groups, searchLower])

  // Auto-expand groups that match search
  useEffect(() => {
    if (searchLower) {
      const matching = new Set<string>()
      for (const group of filteredGroups) {
        const key = groupKeys.get(spec.groups.find((g) => g.name === group.name && g.prefix === group.prefix)!) ?? group.name
        if (group.endpoints.length > 0) matching.add(key)
      }
      setExpandedGroups(matching)
    }
  }, [searchLower, filteredGroups, groupKeys, spec.groups])

  function toggleExpand(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function expandAll() {
    setExpandedGroups(new Set(filteredGroups.map((g, i) => {
      const original = spec.groups.find((og) => og.name === g.name && og.prefix === g.prefix)
      return original ? (groupKeys.get(original) ?? g.name) : groupKey(g, i)
    })))
  }

  function collapseAll() {
    setExpandedGroups(new Set())
  }

  /** Display name for a group (handles empty names from bad tags). */
  function displayName(group: ParsedGroup): string {
    if (group.name) return group.name
    // Derive from prefix: /api/v1/users → "users"
    const last = group.prefix.split("/").filter(Boolean).pop()
    return last ? `[${last}]` : "[unnamed]"
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Header info */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-medium">Select Endpoints</h2>
          <p className="text-xs text-text-muted">
            {spec.format.toUpperCase()} — {spec.title} — {totalSelected}/{totalEndpoints} selected
          </p>
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={totalSelected === 0}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
        >
          Next: Options
        </button>
      </div>

      {/* Source name + output dir */}
      <div className="flex gap-3">
        <label className="flex-1 space-y-1">
          <span className="text-xs text-text-muted">Source name</span>
          <input
            type="text"
            value={options.sourceName}
            onChange={(e) => onOptionsChange({ ...options, sourceName: e.target.value })}
            className="w-full rounded border border-border-default bg-surface-1 px-2.5 py-1.5 text-sm text-text-primary focus:border-indigo-500/50 focus:outline-none"
          />
        </label>
        <label className="flex-1 space-y-1">
          <span className="text-xs text-text-muted">Base URL</span>
          <input
            type="text"
            value={spec.baseURL}
            disabled
            className="w-full rounded border border-border-subtle bg-surface-0 px-2.5 py-1.5 text-sm text-text-muted"
          />
        </label>
        <label className="flex-1 space-y-1">
          <span className="text-xs text-text-muted">Output directory</span>
          <input
            type="text"
            value={options.outputDir}
            onChange={(e) => onOptionsChange({ ...options, outputDir: e.target.value })}
            className="w-full rounded border border-border-default bg-surface-1 px-2.5 py-1.5 text-sm text-text-primary focus:border-indigo-500/50 focus:outline-none"
          />
          <span className="text-[10px] text-text-muted">
            Files: {options.outputDir.replace(/\/+$/, "")}/{options.sourceName}/
          </span>
        </label>
      </div>

      {/* Search + bulk actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search endpoints..."
            className="w-full rounded-lg border border-border-default bg-surface-1 py-1.5 pl-8 pr-8 text-xs text-text-primary placeholder-text-muted focus:border-indigo-500/50 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onSelectAll}
          className="rounded border border-border-subtle bg-surface-1 px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          Select All
        </button>
        <button
          type="button"
          onClick={onDeselectAll}
          className="rounded border border-border-subtle bg-surface-1 px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          Deselect All
        </button>
        <button
          type="button"
          onClick={expandAll}
          className="rounded border border-border-subtle bg-surface-1 px-2 py-1.5 text-text-muted transition-colors hover:text-text-secondary"
          title="Expand all"
        >
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="rounded border border-border-subtle bg-surface-1 px-2 py-1.5 text-text-muted transition-colors hover:text-text-secondary"
          title="Collapse all"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Endpoint tree */}
      <div className="rounded-lg border border-border-default">
        {filteredGroups.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-text-muted">
            No endpoints match "{search}"
          </div>
        )}
        {filteredGroups.map((group) => {
          // Find the original group to get stable key
          const originalGroup = spec.groups.find((g) => g.name === group.name && g.prefix === group.prefix)
          const gKey = originalGroup ? (groupKeys.get(originalGroup) ?? group.name) : group.name
          const groupSel = selection[gKey] ?? new Set()
          // Compare against full group size for checkbox state (not filtered)
          const fullGroup = originalGroup ?? group
          const allSelected = groupSel.size === fullGroup.endpoints.length && fullGroup.endpoints.length > 0
          const someSelected = groupSel.size > 0 && !allSelected
          const isExpanded = expandedGroups.has(gKey)
          const selectedCount = groupSel.size

          return (
            <div key={gKey} className="border-b border-border-subtle last:border-b-0">
              {/* Group header */}
              <div className="flex items-center gap-2 px-3 py-2 hover:bg-surface-1">
                <button type="button" onClick={() => toggleExpand(gKey)} className="text-text-muted hover:text-text-secondary">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <button
                  type="button"
                  onClick={() => onToggleGroup(gKey)}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition-colors ${
                    allSelected
                      ? "border-indigo-500 bg-indigo-500 text-white"
                      : someSelected
                        ? "border-indigo-500 bg-indigo-500/30 text-indigo-400"
                        : "border-border-default bg-surface-0 hover:border-border-hover"
                  }`}
                >
                  {allSelected && <Check size={10} />}
                  {someSelected && <Minus size={10} />}
                </button>

                <span className="text-sm font-medium">{displayName(group)}</span>
                <span className="text-xs text-text-muted">{group.prefix}</span>
                {group.description && (
                  <span className="truncate text-xs text-text-muted max-w-xs" title={group.description}>
                    — {group.description}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2 text-xs text-text-muted">
                  {selectedCount > 0 && (
                    <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">
                      {selectedCount}
                    </span>
                  )}
                  {fullGroup.endpoints.length} endpoint{fullGroup.endpoints.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Endpoints */}
              {isExpanded && (
                <div className="border-t border-border-subtle bg-surface-0">
                  {group.endpoints.map((ep) => {
                    const isSelected = groupSel.has(ep.name)
                    return (
                      <div
                        key={ep.name}
                        onClick={() => onToggleEndpoint(gKey, ep.name)}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 pl-10 hover:bg-surface-1"
                      >
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition-colors ${
                            isSelected
                              ? "border-indigo-500 bg-indigo-500 text-white"
                              : "border-border-default bg-surface-0"
                          }`}
                        >
                          {isSelected && <Check size={10} />}
                        </div>

                        <span className={`w-14 text-right font-mono text-xs font-bold uppercase ${HTTP_METHOD_COLORS[ep.httpMethod] ?? "text-text-muted"}`}>
                          {ep.httpMethod}
                        </span>

                        <span className="truncate font-mono text-xs text-text-secondary">{ep.fullPath}</span>

                        <span className="text-text-muted shrink-0">→</span>

                        <span className="shrink-0 font-mono text-xs text-indigo-400">{ep.name}</span>

                        {ep.secured && <Badge variant="amber">auth</Badge>}

                        {ep.description && (
                          <span className="ml-auto truncate text-xs text-text-muted max-w-[200px]">{ep.description}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 3: Options ──────────────────────────────────────────────────────────

function OptionsStep({
  options,
  loading,
  onOptionsChange,
  onGenerate,
}: {
  options: GenerateOptions
  loading: boolean
  onOptionsChange: (o: GenerateOptions) => void
  onGenerate: () => void
}) {
  function RadioGroup({ label, value, items, onChange }: {
    label: string
    value: string
    items: { id: string; label: string }[]
    onChange: (v: string) => void
  }) {
    return (
      <div className="space-y-2">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <div className="flex gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                value === item.id
                  ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                  : "bg-surface-1 text-text-muted border border-border-subtle hover:text-text-secondary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  function Toggle({ label, checked, onChange }: {
    label: string
    checked: boolean
    onChange: (v: boolean) => void
  }) {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
            checked
              ? "border-indigo-500 bg-indigo-500 text-white"
              : "border-border-default bg-surface-0"
          }`}
        >
          {checked && <Check size={10} />}
        </button>
        <span className="text-xs text-text-secondary">{label}</span>
      </label>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-medium">Generation Options</h2>
          <p className="text-xs text-text-muted">Configure how the Nexus code is generated.</p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Code size={14} />}
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      <div className="space-y-5 rounded-lg border border-border-default p-4">
        <RadioGroup
          label="Validation Library"
          value={options.validation}
          items={[
            { id: "zod", label: "Zod" },
            { id: "valibot", label: "Valibot" },
            { id: "arktype", label: "ArkType" },
            { id: "none", label: "None (types only)" },
          ]}
          onChange={(v) => onOptionsChange({ ...options, validation: v as GenerateOptions["validation"] })}
        />

        <RadioGroup
          label="Group By"
          value={options.groupBy}
          items={[
            { id: "tag", label: "OpenAPI Tag" },
            { id: "path", label: "Path Prefix" },
            { id: "single", label: "Single Group" },
          ]}
          onChange={(v) => onOptionsChange({ ...options, groupBy: v as GenerateOptions["groupBy"] })}
        />

        <RadioGroup
          label="Naming Convention"
          value={options.naming}
          items={[
            { id: "camelCase", label: "camelCase" },
            { id: "as-is", label: "As-is from spec" },
          ]}
          onChange={(v) => onOptionsChange({ ...options, naming: v as GenerateOptions["naming"] })}
        />

        <RadioGroup
          label="Client File"
          value={options.generateClient}
          items={[
            { id: "both", label: "Direct + Proxy" },
            { id: "direct", label: "Direct only" },
            { id: "proxy", label: "Proxy only" },
            { id: "none", label: "None" },
          ]}
          onChange={(v) => onOptionsChange({ ...options, generateClient: v as GenerateOptions["generateClient"] })}
        />

        <div className="space-y-2.5 border-t border-border-subtle pt-4">
          <Toggle
            label="Generate TypeScript types"
            checked={options.generateTypes}
            onChange={(v) => onOptionsChange({ ...options, generateTypes: v })}
          />
          <Toggle
            label="Generate validation schemas"
            checked={options.generateSchemas}
            onChange={(v) => onOptionsChange({ ...options, generateSchemas: v })}
          />
          <Toggle
            label="Add auth middleware to secured endpoints"
            checked={options.addAuthMiddleware}
            onChange={(v) => onOptionsChange({ ...options, addAuthMiddleware: v })}
          />
          <Toggle
            label="Include JSDoc comments from spec descriptions"
            checked={options.includeComments}
            onChange={(v) => onOptionsChange({ ...options, includeComments: v })}
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 4: Preview ──────────────────────────────────────────────────────────

function PreviewStep({
  files,
  activeFileIndex,
  loading,
  writeResult,
  onFileSelect,
  onWrite,
  onCopy,
  onDownload,
}: {
  files: GeneratedFile[]
  activeFileIndex: number
  loading: boolean
  writeResult: string | null
  onFileSelect: (i: number) => void
  onWrite: () => void
  onCopy: () => void
  onDownload: () => void
}) {
  const [copied, setCopied] = useState(false)
  const activeFile = files[activeFileIndex]

  function copyFile() {
    if (!activeFile) return
    navigator.clipboard.writeText(activeFile.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-medium">Preview</h2>
          <p className="text-xs text-text-muted">{files.length} file{files.length > 1 ? "s" : ""} generated</p>
        </div>
        <div className="flex items-center gap-2">
          {writeResult && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check size={12} /> {writeResult}
            </span>
          )}
          <button
            type="button"
            onClick={onCopy}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-1 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2"
          >
            <Copy size={12} /> Copy All
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-1 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2"
          >
            <Download size={12} /> Download
          </button>
          <button
            type="button"
            onClick={onWrite}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={12} />}
            Write to Project
          </button>
        </div>
      </div>

      {/* File tabs + content */}
      <div className="flex flex-1 overflow-hidden rounded-lg border border-border-default">
        {/* File tabs (left) */}
        <div className="w-48 shrink-0 overflow-auto border-r border-border-default bg-surface-0">
          {files.map((file, i) => {
            const fileName = file.path.split("/").pop() ?? file.path
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => onFileSelect(i)}
                className={`flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs transition-colors ${
                  i === activeFileIndex
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-muted hover:bg-surface-1 hover:text-text-secondary"
                }`}
              >
                <FileText size={12} className="shrink-0" />
                <span className="truncate font-mono">{fileName}</span>
              </button>
            )
          })}
        </div>

        {/* Code preview */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {activeFile && (
            <>
              {/* File path bar */}
              <div className="flex items-center justify-between border-b border-border-subtle bg-surface-0 px-3 py-1.5">
                <span className="font-mono text-xs text-text-muted">{activeFile.path}</span>
                <button
                  type="button"
                  onClick={copyFile}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              {/* Code */}
              <pre className="flex-1 overflow-auto bg-surface-1 p-4 font-mono text-xs leading-5 text-text-primary">
                {activeFile.content}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
