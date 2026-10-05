"use client"

import { useEffect, useState } from "react"

/**
 * An element's height, kept as it changes.
 *
 * @returns A ref to put on the element, and its height in px
 * @example
 * ```tsx
 * const [ref, height] = useElementHeight<HTMLDivElement>()
 * ```
 */
export function useElementHeight<TElement extends HTMLElement>(): [
  (node: TElement | null) => void,
  number,
] {
  const [node, setNode] = useState<TElement | null>(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    if (!node) return
    const observer = new ResizeObserver(([entry]) =>
      setHeight(Math.round(entry?.contentRect.height ?? 0))
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return [setNode, height]
}
