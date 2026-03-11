import { Link, FolderOpen, FileText, Loader2, Upload } from "lucide-react"

import type { ImportSource } from "./types"

const IMPORT_SOURCES: { id: ImportSource; icon: typeof Link; label: string; placeholder: string }[] = [
  { id: "url", icon: Link, label: "URL", placeholder: "https://api.example.com/openapi.json" },
  { id: "file", icon: FolderOpen, label: "File Path", placeholder: "./specs/openapi.yaml" },
  { id: "raw", icon: FileText, label: "Paste", placeholder: "Paste OpenAPI JSON/YAML or Postman Collection here..." },
]

export function ImportStep({
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
        {IMPORT_SOURCES.map(({ id, icon: Icon, label }) => (
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
          placeholder={IMPORT_SOURCES.find((s) => s.id === source)?.placeholder}
          className="h-64 w-full resize-none rounded-lg border border-border-default bg-surface-1 px-3 py-2 font-mono text-xs text-text-primary placeholder-text-muted focus:border-indigo-500/50 focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder={IMPORT_SOURCES.find((s) => s.id === source)?.placeholder}
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
