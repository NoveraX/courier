import { useCallback, useRef } from "react"

// ── Drag Handle ─────────────────────────────────────────────────────────────

/** Vertical drag handle for resizing adjacent panels */
export function DragHandle({ onResize }: { onResize: (width: number) => void }) {
  const startRef = useRef({ x: 0, width: 0 })

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    const panel = target.nextElementSibling as HTMLElement | null
    if (!panel) return

    startRef.current = { x: e.clientX, width: panel.offsetWidth }
    target.setPointerCapture(e.pointerId)

    const onPointerMove = (ev: PointerEvent) => {
      // Moving left = making detail panel wider
      const delta = startRef.current.x - ev.clientX
      const newWidth = Math.max(300, Math.min(900, startRef.current.width + delta))
      onResize(newWidth)
    }

    const onPointerUp = () => {
      target.removeEventListener("pointermove", onPointerMove)
      target.removeEventListener("pointerup", onPointerUp)
    }

    target.addEventListener("pointermove", onPointerMove)
    target.addEventListener("pointerup", onPointerUp)
  }, [onResize])

  return (
    <div
      onPointerDown={handlePointerDown}
      className="group flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-border/50 transition-colors hover:bg-primary/20 active:bg-primary/30"
    >
      <div className="h-6 w-0.5 rounded-full bg-muted-foreground/25 transition-colors group-hover:bg-primary/50" />
    </div>
  )
}
