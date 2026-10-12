"use client"

import { useEffect, useState } from "react"

const HEADER = 56

interface ScrollProgressOptions {
  /** The window's height the section is laid out for: its small height, which holds still. */
  height: number
  /** The progress the section shows for a given one: where the frame shown there begins. */
  snap: (progress: number) => number
}

function measure(node: HTMLElement, height: number): number {
  const rect = node.getBoundingClientRect()
  const span = rect.height - (height - HEADER)
  return Math.max(0, Math.min(1, (HEADER - rect.top) / (span > 0 ? span : 1)))
}

/**
 * How far the reader has scrolled through a section taller than the
 * window: 0 when its top meets the header, 1 when its bottom meets the
 * window's. It is measured once a frame while scrolling, against the
 * window's small height so that a phone's toolbars sliding away and back do
 * not move it, and handed on snapped to where the section's frame changes —
 * the section re-renders as the reader crosses such a point, not on every
 * frame of the scroll.
 *
 * @param options - The window's small height, and how a progress snaps to the frame it shows
 * @returns A ref to put on the section, and the snapped progress
 * @example
 * ```tsx
 * const { height } = useSmallViewport()
 * const [ref, progress] = useScrollProgress<HTMLElement>({ height, snap: refactorStop })
 * ```
 */
export function useScrollProgress<TElement extends HTMLElement>({
  height,
  snap,
}: ScrollProgressOptions): [(node: TElement | null) => void, number] {
  const [node, setNode] = useState<TElement | null>(null)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!node) return
    let frame = 0
    const update = () => {
      frame = 0
      setProgress(snap(measure(node, height)))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
    }
  }, [node, height, snap])
  return [setNode, progress]
}
