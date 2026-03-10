import { useRef, useState, useCallback } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

import type { RequestEntry } from "../../store"

import { RequestRow } from "./request-row"
import { RequestContextMenu } from "./context-menu"

import type { ContextMenuState } from "./context-menu"

// ── Virtual Request List ─────────────────────────────────────────────────────

export function VirtualRequestList({
  requests,
  selectedId,
  onSelect,
  onTogglePin,
}: {
  requests: RequestEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  onTogglePin: (id: string) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const virtualizer = useVirtualizer({
    count: requests.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 20,
  })

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, request: RequestEntry) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, request })
    },
    [],
  )

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const request = requests[virtualItem.index]!
          return (
            <div
              key={virtualItem.key}
              className="absolute left-0 w-full animate-slide-in"
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <RequestRow
                request={request}
                selected={request.id === selectedId}
                onSelect={() => onSelect(request.id)}
                onTogglePin={() => onTogglePin(request.id)}
                onContextMenu={(e) => handleContextMenu(e, request)}
              />
            </div>
          )
        })}
      </div>

      {contextMenu && (
        <RequestContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onTogglePin={onTogglePin}
        />
      )}
    </div>
  )
}
