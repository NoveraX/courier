"use client"

import { usePathname } from "next/navigation"

import { useSeenRequests } from "./use-seen-requests"

/**
 * How many requests this browser has sent the site's proxy route while on
 * the page, as the browser itself records them: on a page whose calls are
 * made on the server, none.
 *
 * @returns The count, in words, read out as it changes
 * @example
 * ```tsx
 * <BrowserCalls />
 * ```
 */
export function BrowserCalls() {
  const requests = useSeenRequests()
  const page = usePathname()
  const sent = requests.filter((request) => request.page === page && request.call !== undefined)
  return (
    <p role="status" className="m-0 font-mono text-meta text-fg-subtle">
      This browser has sent {sent.length} {sent.length === 1 ? "request" : "requests"} to
      /api/request while on this page, as its own record of requests says.
    </p>
  )
}
