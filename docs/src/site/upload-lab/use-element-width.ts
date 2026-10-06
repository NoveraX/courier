"use client"

import { useEffect, useState } from "react"

/**
 * An element's width, kept as it changes.
 *
 * @returns A ref to put on the element, and its width in px — 0 until it is measured
 * @example
 * ```tsx
 * const [ref, width] = useElementWidth<HTMLDivElement>()
 * ```
 */
export function useElementWidth<TElement extends HTMLElement>(): [
  (node: TElement | null) => void,
  number,
] {
  const [node, setNode] = useState<TElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!node) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry?.contentRect.width ?? 0))
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return [setNode, width]
}
