"use client"

import { useEffect } from "react"

/* The anchor the address names, as the page's ids are written; nothing for one that is not. */
function anchorOf(hash: string): string | undefined {
  try {
    return hash.length > 1 ? decodeURIComponent(hash.slice(1)) : undefined
  } catch {
    return undefined
  }
}

/**
 * Sends a reader who comes by the anchor of a section that moved to
 * another page on to its new address, as the page opens and as its anchor
 * changes. An anchor the page still has is left to the page.
 *
 * @param props.moved - The page's moved anchors, each with its new address
 * @returns Nothing it shows
 * @example
 * ```tsx
 * <MovedAnchors moved={{ "host-a-public-demo": "/docs/studio/public-demo" }} />
 * ```
 */
export function MovedAnchors({ moved }: { moved: Readonly<Record<string, string>> }) {
  useEffect(() => {
    const follow = () => {
      const anchor = anchorOf(window.location.hash)
      if (anchor === undefined) return
      const target = moved[anchor]
      if (target !== undefined && document.getElementById(anchor) === null) {
        window.location.replace(target)
      }
    }
    follow()
    window.addEventListener("hashchange", follow)
    return () => window.removeEventListener("hashchange", follow)
  }, [moved])
  return null
}
