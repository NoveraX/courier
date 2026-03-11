import { Check, ChevronDown, ChevronRight, Minus } from "lucide-react"

import { Badge } from "../../components/badge"
import { HTTP_METHOD_COLORS } from "./helpers"

export function GroupHeader({
  displayName,
  prefix,
  description,
  endpointCount,
  selectedCount,
  allSelected,
  someSelected,
  isExpanded,
  onToggleExpand,
  onToggleGroup,
}: {
  displayName: string
  prefix: string
  description: string
  endpointCount: number
  selectedCount: number
  allSelected: boolean
  someSelected: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  onToggleGroup: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-surface-1">
      <button type="button" onClick={onToggleExpand} className="text-text-muted hover:text-text-secondary">
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <button
        type="button"
        onClick={onToggleGroup}
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
      <span className="text-sm font-medium">{displayName}</span>
      <span className="text-xs text-text-muted">{prefix}</span>
      {description && (
        <span className="truncate text-xs text-text-muted max-w-xs" title={description}>— {description}</span>
      )}
      <span className="ml-auto flex items-center gap-2 text-xs text-text-muted">
        {selectedCount > 0 && (
          <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">{selectedCount}</span>
        )}
        {endpointCount} endpoint{endpointCount !== 1 ? "s" : ""}
      </span>
    </div>
  )
}

export function EndpointRow({
  name,
  httpMethod,
  fullPath,
  secured,
  description,
  isSelected,
  onClick,
}: {
  name: string
  httpMethod: string
  fullPath: string
  secured: boolean
  description: string
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div onClick={onClick} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 pl-10 hover:bg-surface-1">
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition-colors ${
          isSelected ? "border-indigo-500 bg-indigo-500 text-white" : "border-border-default bg-surface-0"
        }`}
      >
        {isSelected && <Check size={10} />}
      </div>
      <span className={`w-14 text-right font-mono text-xs font-bold uppercase ${HTTP_METHOD_COLORS[httpMethod] ?? "text-text-muted"}`}>{httpMethod}</span>
      <span className="truncate font-mono text-xs text-text-secondary">{fullPath}</span>
      <span className="text-text-muted shrink-0">&rarr;</span>
      <span className="shrink-0 font-mono text-xs text-indigo-400">{name}</span>
      {secured && <Badge variant="amber">auth</Badge>}
      {description && (
        <span className="ml-auto truncate text-xs text-text-muted max-w-[200px]">{description}</span>
      )}
    </div>
  )
}
