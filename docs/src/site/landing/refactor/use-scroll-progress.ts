"use client"

import { useEffect, useState } from "react"

const HEADER = 56

/** How far through a tall section the reader is, and the window it is read in. */
export interface ScrollProgress {
  progress: number
  width: number
  height: number
}

function measure(node: HTMLElement): ScrollProgress {
  const rect = node.getBoundingClientRect()
  const span = rect.height - (window.innerHeight - HEADER)
  const progress = Math.max(0, Math.min(1, (HEADER - rect.top) / (span > 0 ? span : 1)))
  return { progress, width: window.innerWidth, height: window.innerHeight }
}

/**
 * How far the reader has scrolled through a section taller than the
 * window: 0 when its top meets the header, 1 when its bottom meets the
 * window's — measured once a frame while scrolling or resizing.
 *
 * @returns A ref to put on the section, and the progress with the window's size
 * @example
 * ```tsx
 * const [ref, { progress }] = useScrollProgress<HTMLElement>()
 * ```
 */
export function useScrollProgress<TElement extends HTMLElement>(): [
  (node: TElement | null) => void,
  ScrollProgress,
] {
  const [node, setNode] = useState<TElement | null>(null)
  const [state, setState] = useState<ScrollProgress>({ progress: 0, width: 1200, height: 900 })
  useEffect(() => {
    if (!node) return
    let frame = 0
    const update = () => {
      frame = 0
      const next = measure(node)
      setState((last) =>
        Math.abs(next.progress - last.progress) > 0.002 ||
        next.width !== last.width ||
        next.height !== last.height
          ? next
          : last
      )
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
  }, [node])
  return [setNode, state]
}
