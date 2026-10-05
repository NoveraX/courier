import type { ReactNode } from "react"

/**
 * The frame a chapter's visual sits in: it marks the visual so its parts
 * animate in once it has been seen.
 *
 * @param props - The visual's name, a ref to watch it by, whether it has been seen, and the visual
 * @returns The frame
 * @example
 * ```tsx
 * <VizFrame name="inspect" frameRef={ref} seen={seen}>…</VizFrame>
 * ```
 */
export function VizFrame({
  name,
  frameRef,
  seen,
  children,
}: {
  name: string
  frameRef: (node: HTMLDivElement | null) => void
  seen: boolean
  children: ReactNode
}) {
  return (
    <div
      ref={frameRef}
      data-viz={name}
      data-in={seen ? "" : undefined}
      className="relative overflow-hidden rounded-2xl border border-line bg-panel shadow-(--studio-shadow)"
    >
      {children}
    </div>
  )
}
