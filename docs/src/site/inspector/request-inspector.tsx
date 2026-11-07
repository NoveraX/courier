"use client"

import { usePathname } from "next/navigation"
import { useEffect, useId, useMemo, useRef, useState } from "react"

import { SeenRequestItem } from "./seen-request"
import { requestSummary } from "./summary"
import { useSeenRequests } from "./use-seen-requests"

/* The requests an inspector shows at once, the newest first and open. */
const SHOWN = 3

interface RequestInspectorProps {
  /** The calls whose requests it shows, as `api.users.create`. */
  calls?: readonly string[] | undefined
  /** Calls its own lead to — a list a mutation fetches again — shown when its control sent them. */
  followUps?: readonly string[] | undefined
  /** Whether it shows the page's Server Action requests too. */
  actions?: boolean | undefined
}

/**
 * The requests a sandbox's calls made, as the browser recorded them and
 * as the site's server told of them: the newest three, the newest open,
 * each headed by the way it went in words. Nothing in it comes from the
 * sandbox's own code: the browser records each request the page makes, and
 * the server says what it saw in the answer's `Server-Timing`. A request
 * is the sandbox's when one of its calls sent it after the visitor used
 * the sandbox's controls, or when the page sent it as it loaded; a call
 * its own lead to is its only when its control sent it. One the sandbox's
 * control sent is read out once it is answered.
 *
 * @param props - The calls it shows, those they lead to, and whether Server Actions too
 * @returns The inspector
 * @example
 * ```tsx
 * <Sandbox label="…" controls={…} result={…} inspector={<RequestInspector calls={["api.users.create"]} />} />
 * ```
 */
export function RequestInspector({
  calls = [],
  followUps = [],
  actions = false,
}: RequestInspectorProps) {
  const requests = useSeenRequests()
  const page = usePathname()
  const root = useRef<HTMLElement>(null)
  const [sandbox, setSandbox] = useState<Element | null>(null)
  const [said, setSaid] = useState("")
  const heading = useId()
  useEffect(() => setSandbox(root.current?.closest("[data-sandbox]") ?? null), [])

  const named = calls.join(" ")
  const following = followUps.join(" ")
  const ours = useMemo(() => {
    const own = new Set(named.split(" "))
    const led = new Set(following.split(" "))
    return requests.filter((request) => {
      if (request.page !== page) return false
      const sent = sandbox !== null && request.cause === sandbox
      if (!sent && request.cause !== undefined) return false
      if (request.action) return actions
      const call = request.call
      if (call === undefined) return false
      return own.has(call) || (sent && led.has(call))
    })
  }, [requests, page, sandbox, named, following, actions])

  const newest = ours.at(-1)
  useEffect(() => {
    if (newest !== undefined && sandbox !== null && newest.cause === sandbox) {
      setSaid(requestSummary(newest))
    }
  }, [newest, sandbox])

  const shown = ours.slice(-SHOWN).reverse()
  const earlier = ours.length - shown.length
  return (
    <section ref={root} aria-labelledby={heading} className="border-t border-line px-4.5 py-3.5">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h3
          id={heading}
          className="m-0 font-mono text-micro tracking-[0.06em] text-fg-subtle uppercase"
        >
          Requests
        </h3>
        <p className="m-0 text-[11.5px] text-fg-subtle">
          as the browser recorded them and the site&apos;s server told of them
        </p>
      </div>
      {shown.length === 0 ? (
        <p className="m-0 font-mono text-meta text-code-comment">
          {"// no request yet: run the call"}
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {shown.map((request, index) => (
            <SeenRequestItem key={request.key} request={request} open={index === 0} />
          ))}
        </ol>
      )}
      {earlier > 0 && (
        <p className="m-0 mt-2 text-[11.5px] text-fg-subtle">and {earlier} earlier, not shown</p>
      )}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </section>
  )
}
