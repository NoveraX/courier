import { useState } from "react"
import { FileText, FolderOpen, Link, Loader2, Upload, X } from "lucide-react"

import type { ImportSource, ParsedSpec } from "./types"
import { fetchParseSpec } from "./api"

const SOURCES: { id: ImportSource; icon: typeof Link; label: string; placeholder: string }[] = [
  { id: "url", icon: Link, label: "URL", placeholder: "https://api.example.com/openapi.json" },
  { id: "file", icon: FolderOpen, label: "File", placeholder: "./specs/openapi.yaml" },
  { id: "raw", icon: FileText, label: "Paste", placeholder: "Paste OpenAPI JSON/YAML here..." },
]

export function UpdateImport({ sourceName, onParsed, onCancel }: {
  sourceName: string
  onParsed: (spec: ParsedSpec) => void
  onCancel: () => void
}) {
  const [source, setSource] = useState<ImportSource>("file")
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleParse = async () => {
    if (!content.trim()) return
    setLoading(true)
    setError(null)
    try {
      const spec = await fetchParseSpec(source, content)
      onParsed(spec)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse spec")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border-default pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">
          Import updated spec for {sourceName}
        </span>
        <button type="button" onClick={onCancel} className="rounded p-0.5 text-text-muted hover:text-text-secondary">
          <X size={12} />
        </button>
      </div>

      <div className="flex gap-1.5">
        {SOURCES.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSource(id)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
              source === id
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                : "bg-surface-1 text-text-muted hover:text-text-secondary border border-border-subtle"
            }`}
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
      </div>

      {source === "raw" ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={SOURCES.find((s) => s.id === source)?.placeholder}
          className="h-32 w-full resize-none rounded-lg border border-border-default bg-surface-1 px-2.5 py-2 font-mono text-xs text-text-primary placeholder-text-muted focus:border-indigo-500/50 focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={SOURCES.find((s) => s.id === source)?.placeholder}
          onKeyDown={(e) => e.key === "Enter" && handleParse()}
          className="w-full rounded-lg border border-border-default bg-surface-1 px-2.5 py-2 text-xs text-text-primary placeholder-text-muted focus:border-indigo-500/50 focus:outline-none"
        />
      )}

      {error && (
        <p className="text-[11px] text-red-400">{error}</p>
      )}

      <button
        type="button"
        onClick={handleParse}
        disabled={loading || !content.trim()}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-3 py-1.5 text-xs text-indigo-400 transition-colors hover:bg-indigo-500/25 disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        {loading ? "Parsing..." : "Parse & Compare"}
      </button>
    </div>
  )
}
