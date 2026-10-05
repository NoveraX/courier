import { ListFilter } from "lucide-react"

/** A filter over the reference's exports, and what it leaves. */
export interface ExportFilterState {
  value: string
  onChange: (value: string) => void
  /** How many exports the filter leaves. */
  shown: number
  /** How many there are. */
  total: number
}

/**
 * The filter over the reference's exports, as the docs' sidebar filters its
 * pages: what it leaves of them counted beside it.
 *
 * @param props - The filter
 * @returns The field
 * @example
 * ```tsx
 * <ExportFilter value={filter} onChange={setFilter} shown={12} total={40} />
 * ```
 */
export function ExportFilter({ value, onChange, shown, total }: ExportFilterState) {
  return (
    <label className="mb-3 flex h-7.5 min-w-0 items-center gap-1.75 rounded-control border border-line bg-panel px-2.25 text-fg-subtle">
      <ListFilter aria-hidden="true" className="size-3 shrink-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter exports"
        aria-label="Filter exports"
        className="min-w-0 flex-1 border-0 bg-transparent text-small text-fg outline-none placeholder:text-fg-subtle"
      />
      <span className="rounded-[4px] border border-line px-1.25 py-px font-mono text-micro tabular-nums">
        {shown === total ? total : `${shown}/${total}`}
      </span>
    </label>
  )
}
