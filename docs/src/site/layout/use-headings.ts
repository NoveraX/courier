"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

/** A section heading of the page, as the outline lists it. */
export interface PageHeading {
  id: string
  label: string
  level: 2 | 3
}

/**
 * The page's section headings — its `h2` and `h3` with an id, inside the
 * article — read again whenever the page changes.
 *
 * @returns The headings, in page order
 * @example
 * ```tsx
 * const headings = useHeadings()
 * ```
 */
export function useHeadings(): PageHeading[] {
  const pathname = usePathname()
  const [headings, setHeadings] = useState<PageHeading[]>([])
  // biome-ignore lint/correctness/useExhaustiveDependencies: read the headings again on every page change
  useEffect(() => {
    const found = document.querySelectorAll<HTMLHeadingElement>("[data-article] :is(h2, h3)[id]")
    setHeadings(
      Array.from(found, (heading) => ({
        id: heading.id,
        label: Array.from(heading.childNodes, (node) =>
          node instanceof HTMLAnchorElement ||
          (node instanceof HTMLElement && node.hasAttribute("data-badge"))
            ? ""
            : (node.textContent ?? "")
        )
          .join("")
          .trim(),
        level: heading.tagName === "H3" ? 3 : 2,
      }))
    )
  }, [pathname])
  return headings
}
