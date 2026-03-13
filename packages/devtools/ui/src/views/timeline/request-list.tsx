import { useRef, useEffect, useMemo } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

import type { RequestEntry, TimestampFormat } from "../../store"

import { RequestRow } from "./request-row"
import { RequestContextMenuWrapper } from "./context-menu"
import { PinnedSection } from "./pinned-section"
import { ROW_HEIGHT } from "./constants"

// ── Virtual Request List ────────────────────────────────────────────────────

export function VirtualRequestList({
  requests, selectedId, onSelect, onTogglePin, timestampFormat, slowThreshold,
}: {
  requests: RequestEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  onTogglePin: (id: string) => void
  timestampFormat: TimestampFormat
  slowThreshold: number
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  const { pinned, unpinned } = useMemo(() => {
    const p: RequestEntry[] = []
    const u: RequestEntry[] = []
    for (const r of requests) {
      if (r.pinned) p.push(r)
      else u.push(r)
    }
    return { pinned: p, unpinned: u }
  }, [requests])

  const virtualizer = useVirtualizer({
    count: unpinned.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  // Keyboard navigation: ↑/↓ across both pinned and unpinned
  const allOrdered = useMemo(() => [...pinned, ...unpinned], [pinned, unpinned])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      if (allOrdered.length === 0) return

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        const currentIdx = selectedId
          ? allOrdered.findIndex((r) => r.id === selectedId)
          : -1

        const nextIdx = e.key === "ArrowDown"
          ? Math.min(currentIdx + 1, allOrdered.length - 1)
          : Math.max(currentIdx - 1, 0)

        const next = allOrdered[nextIdx]
        if (next) {
          onSelect(next.id)
          const unpinnedIdx = unpinned.findIndex((r) => r.id === next.id)
          if (unpinnedIdx >= 0) {
            virtualizer.scrollToIndex(unpinnedIdx, { align: "auto" })
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [allOrdered, unpinned, selectedId, onSelect, virtualizer])

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      {/* Pinned section */}
      {pinned.length > 0 && (
        <PinnedSection
          pinned={pinned}
          selectedId={selectedId}
          onSelect={onSelect}
          onTogglePin={onTogglePin}
          timestampFormat={timestampFormat}
          slowThreshold={slowThreshold}
        />
      )}

      {/* Virtual unpinned list */}
      <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const request = unpinned[virtualItem.index]!
          return (
            <div
              key={virtualItem.key}
              className="absolute left-0 w-full"
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
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
          )
        })}
      </div>
    </div>
  )
}
