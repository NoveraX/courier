"use client"

import type { ReactNode } from "react"

interface TopLinkProps {
  /** The page it is on, which a new tab or a copied link opens. */
  href: string
  className?: string
  /** What a screen reader calls it, when its content does not say. */
  label?: string | undefined
  /** It is the page's own entry in the site's navigation, marked as the current page. */
  current?: boolean
  children: ReactNode
}

/**
 * A link to the page it is on — a logo, or the page's own entry in the
 * site's navigation — which takes the reader back to its top. A click
 * glides up — or jumps, for a reader who asks for less motion — and leaves
 * the address as it is; a click that opens a new tab or window opens the
 * page itself.
 *
 * @param props - The page, the link's classes and name, whether it is the page's navigation entry, and its content
 * @returns The link
 * @example
 * ```tsx
 * <TopLink href="/"><CourierMark width={19} /></TopLink>
 * ```
 */
export function TopLink({ href, className, label, current = false, children }: TopLinkProps) {
  return (
    <a
      href={href}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={className}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return
        event.preventDefault()
        /* "auto" follows html's scroll-behavior: smooth, or instant for less motion. */
        window.scrollTo({ top: 0, behavior: "auto" })
      }}
    >
      {children}
    </a>
  )
}
