import { Pin } from "lucide-react"

import type { RequestEntry, TimestampFormat } from "../../store"
import { Separator } from "@/components/ui/separator"

import { RequestRow } from "./request-row"
import { RequestContextMenuWrapper } from "./context-menu"
import { ROW_HEIGHT } from "./constants"

// ── Pinned Section ──────────────────────────────────────────────────────────

export function PinnedSection({
  pinned, selectedId, onSelect, onTogglePin, timestampFormat, slowThreshold,
}: {
  pinned: RequestEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  onTogglePin: (id: string) => void
  timestampFormat: TimestampFormat
  slowThreshold: number
}) {
  return (
    <div className="sticky top-0 z-10 bg-background">
      {/* Header */}
      <div className="flex h-6 items-center gap-1.5 border-b border-border px-3">
        <Pin className="size-2.5 fill-amber-400 text-amber-400" />
        <span className="text-[10px] font-medium text-amber-400">
          Pinned ({pinned.length})
        </span>
      </div>

      {/* Pinned rows */}
      {pinned.map((request) => (
        <div key={request.id} style={{ height: ROW_HEIGHT }}>
          <RequestContextMenuWrapper
            request={request}
            onTogglePin={() => onTogglePin(request.id)}
          >
            <RequestRow
              request={request}
              selected={request.id === selectedId}
              onSelect={() => onSelect(request.id)}
              onTogglePin={() => onTogglePin(request.id)}
              timestampFormat={timestampFormat}
              slowThreshold={slowThreshold}
            />
          </RequestContextMenuWrapper>
        </div>
      ))}

      <Separator />
    </div>
  )
}
