"use client"

import { cn } from "@/site/cn"
import { JsonView } from "./json-view"

interface ResponseViewProps {
  data?: unknown
  status?: number | undefined
  error?: string | undefined
  /** How long the call took, ms. */
  responseTime?: number | undefined
  /** What a call in flight is waiting for. */
  pending?: boolean | undefined
  className?: string | undefined
}

/* A hook's answer carries no HTTP status: a call that answered without one reads "ok". */
function statusLine(
  status: number | undefined,
  error: string | undefined,
  pending: boolean,
  answered: boolean
) {
  if (pending) return { text: "sending…", tone: "text-fg-subtle" }
  if (error) return { text: status ? `${status} · failed` : "failed", tone: "text-err" }
  if (status !== undefined)
    return { text: String(status), tone: status < 400 ? "text-ok" : "text-warn" }
  return answered ? { text: "ok", tone: "text-ok" } : { text: "idle", tone: "text-fg-subtle" }
}

/**
 * What a sandbox call answered: its HTTP status where the call reports one
 * — else that it is idle, sending, answered or failed — how long it took,
 * and the answer or the error, as JSON.
 *
 * @param props - The answer, its status, the error, the time it took, and whether it is in flight
 * @returns The view
 * @example
 * ```tsx
 * <ResponseView data={data} status={200} responseTime={42} />
 * ```
 */
export function ResponseView({
  data,
  status,
  error,
  responseTime,
  pending = false,
  className,
}: ResponseViewProps) {
  const idle = !pending && !error && data === undefined
  const line = statusLine(status, error, pending, data !== undefined)
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="mb-3 flex items-center gap-3 font-mono text-meta">
        <span className={line.tone}>{line.text}</span>
        {responseTime !== undefined && (
          <span className="ml-auto text-[11px] text-fg-subtle">{Math.round(responseTime)} ms</span>
        )}
      </div>
      <pre className="m-0 max-h-70 overflow-auto rounded-control border border-line bg-bg-subtle p-3.5 text-label leading-[1.7] text-fg-muted">
        {error ? (
          <span className="text-err">{error}</span>
        ) : idle ? (
          <span className="text-code-comment">{"// run the request to see the response"}</span>
        ) : (
          <JsonView value={data} />
        )}
      </pre>
    </div>
  )
}
