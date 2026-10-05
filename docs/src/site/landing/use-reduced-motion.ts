"use client"

import { useEffect, useState } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

/**
 * Whether the reader asked for less motion. The server's render assumes
 * not; the answer follows the setting as it changes.
 *
 * @returns Whether to hold animations still
 * @example
 * ```ts
 * const still = useReducedMotion()
 * ```
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return reduced
}
