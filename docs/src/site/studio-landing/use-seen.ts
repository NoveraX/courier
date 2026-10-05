"use client"

import { useEffect, useState } from "react"

/**
 * Whether an element has been on screen yet — it stays true once it has,
 * so an entrance plays once.
 *
 * @param threshold - How much of it must show, 0 to 1
 * @returns A ref to put on the element, and whether it has been seen
 * @example
 * ```tsx
 * const [ref, seen] = useSeen<HTMLDivElement>(0.3)
 * return <div ref={ref} data-in={seen ? "" : undefined} />
 * ```
 */
export function useSeen<TElement extends Element>(
  threshold = 0
): [(node: TElement | null) => void, boolean] {
  const [node, setNode] = useState<TElement | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!node || seen) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setSeen(true)
      },
      { threshold }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, seen, threshold])
  return [setNode, seen]
}
