"use client"

import { useEffect, useState } from "react"

import type { PageHeading } from "./use-headings"

/**
 * The heading of the section being read: the last one to come into the
 * top part of the window as the page scrolls.
 *
 * @param headings - The page's headings
 * @returns Its id, or `undefined` before any has come into view
 * @example
 * ```tsx
 * const active = useActiveHeading(headings)
 * ```
 */
export function useActiveHeading(headings: readonly PageHeading[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(undefined)
  useEffect(() => {
    setActive(undefined)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id)
      },
      { rootMargin: "-70px 0px -72% 0px" }
    )
    for (const { id } of headings) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [headings])
  return active
}
