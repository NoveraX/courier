import { ChevronDown, ChevronRight, Search, X } from "lucide-react"

import type { GenerateOptions } from "./types"

export function SelectHeaderInfo({
  format,
  title,
  totalSelected,
  totalEndpoints,
  onNext,
}: {
  format: string
  title: string
  totalSelected: number
  totalEndpoints: number
  onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <h2 className="text-base font-medium">Select Endpoints</h2>
        <p className="text-xs text-text-muted">
          {format.toUpperCase()} — {title} — {totalSelected}/{totalEndpoints} selected
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
  )
}

export function SelectConfigFields({
  options,
  baseURL,
  onOptionsChange,
}: {
  options: GenerateOptions
  baseURL: string
  onOptionsChange: (o: GenerateOptions) => void
}) {
  return (
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
        <input type="text" value={baseURL} disabled className="w-full rounded border border-border-subtle bg-surface-0 px-2.5 py-1.5 text-sm text-text-muted" />
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
  )
}

export function SelectSearchBar({
  search,
  setSearch,
  onSelectAll,
  onDeselectAll,
  onExpandAll,
  onCollapseAll,
}: {
  search: string
  setSearch: (v: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onExpandAll: () => void
  onCollapseAll: () => void
}) {
  return (
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
          <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
            <X size={12} />
          </button>
        )}
      </div>
      <button type="button" onClick={onSelectAll} className="rounded border border-border-subtle bg-surface-1 px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary">Select All</button>
      <button type="button" onClick={onDeselectAll} className="rounded border border-border-subtle bg-surface-1 px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary">Deselect All</button>
      <button type="button" onClick={onExpandAll} className="rounded border border-border-subtle bg-surface-1 px-2 py-1.5 text-text-muted transition-colors hover:text-text-secondary" title="Expand all">
        <ChevronDown size={14} />
      </button>
      <button type="button" onClick={onCollapseAll} className="rounded border border-border-subtle bg-surface-1 px-2 py-1.5 text-text-muted transition-colors hover:text-text-secondary" title="Collapse all">
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
