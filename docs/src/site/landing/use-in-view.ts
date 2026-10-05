"use client"

import { useEffect, useState } from "react"

/**
 * Whether an element is on screen, for animations that run only while it
 * can be seen.
 *
 * @param threshold - How much of it must show, 0 to 1
 * @returns A ref to put on the element, and whether it is in view
 * @example
 * ```tsx
 * const [ref, inView] = useInView<HTMLDivElement>()
 * return <div ref={ref}>{inView ? "on screen" : "off"}</div>
 * ```
 */
export function useInView<TElement extends Element>(
  threshold = 0
): [(node: TElement | null) => void, boolean] {
  const [node, setNode] = useState<TElement | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { threshold }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, threshold])
  return [setNode, inView]
}
