"use client"

import { useEffect, useState } from "react"

/**
 * The section being read: the last of the given ones to come into the top
 * part of the window as the page scrolls.
 *
 * @param ids - The sections' ids, in page order
 * @returns The id being read, or `undefined` before any has come into view
 * @example
 * ```tsx
 * const active = useSectionSpy(["define", "create-caller"])
 * ```
 */
export function useSectionSpy(ids: readonly string[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(undefined)
  const key = ids.join(" ")
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id)
      },
      { rootMargin: "-70px 0px -70% 0px" }
    )
    for (const id of key.split(" ")) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [key])
  return active
}
