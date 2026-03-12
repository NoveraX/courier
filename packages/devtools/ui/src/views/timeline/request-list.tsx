import { useRef, useState, useCallback, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

import type { RequestEntry } from "../../store"

import { RequestRow } from "./request-row"
import { RequestContextMenu } from "./context-menu"
import { ROW_HEIGHT } from "./constants"

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
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, request: RequestEntry) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, request })
    },
    [],
  )

  // Keyboard navigation: ↑/↓ to move selection
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      if (requests.length === 0) return

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        const currentIdx = selectedId
          ? requests.findIndex((r) => r.id === selectedId)
          : -1

        const nextIdx =
          e.key === "ArrowDown"
            ? Math.min(currentIdx + 1, requests.length - 1)
            : Math.max(currentIdx - 1, 0)

        const next = requests[nextIdx]
        if (next) {
          onSelect(next.id)
          virtualizer.scrollToIndex(nextIdx, { align: "auto" })
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [requests, selectedId, onSelect, virtualizer])

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
