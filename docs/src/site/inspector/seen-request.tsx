import type { SeenRequest } from "./network-log"
import { duration, requestSummary } from "./summary"
import { ApiLeg, bodyText, bytes, Leg, Names, Row } from "./trace-parts"

/* Where a request went from, as its first leg says it. */
function noteOf(request: SeenRequest): string {
  if (request.action) return "in the browser: Next.js posts the action to the page itself"
  return "in the browser, through the site's proxy route: Next.js and courier-next"
}

/* The answer, as the browser recorded it. */
function answerOf(request: SeenRequest): string {
  if (request.unanswered) return `none: cancelled or failed after ${duration(request.ms)}`
  const status = request.status === undefined ? "answered" : String(request.status)
  const size = request.cached
    ? "from the browser's cache"
    : `${bytes(request.bytes)} over the network`
  return `${status} · ${duration(request.ms)} · ${size}${request.protocol ? ` · ${request.protocol}` : ""}`
}

/**
 * One request the page made, headed by its line of words and opening on
 * its legs: the browser's, as the browser recorded it and as the site's
 * server saw it arrive, and the server's to the API. Under them, the id
 * that finds the same request in the browser's own developer tools.
 *
 * @param props - The request, and whether it shows open
 * @returns The request, as an item of the inspector's list
 * @example
 * ```tsx
 * <SeenRequestItem request={request} open />
 * ```
 */
export function SeenRequestItem({ request, open }: { request: SeenRequest; open: boolean }) {
  const { trace } = request
  const received = trace?.received
  const path = request.target.split("?")[0] ?? request.target
  return (
    <li className="min-w-0 rounded-control border border-line bg-panel">
      <details open={open || undefined}>
        <summary className="px-3 py-2 font-mono text-[12px] text-fg-muted [overflow-wrap:anywhere] marker:text-fg-subtle">
          {requestSummary(request)}
        </summary>
        <div className="grid gap-3.5 border-t border-line px-3 py-3">
          <Leg
            title={`Browser → ${request.action ? `Server Action, POST ${path}` : path}`}
            note={noteOf(request)}
          >
            <Row label="request">
              {received?.method ?? (request.action ? "POST" : "")} {request.target}
            </Row>
            <Row label="answer">{answerOf(request)}</Row>
            {received !== undefined && (
              <Row label="headers it came with">
                <Names names={received.headers} />
              </Row>
            )}
            {received?.body !== undefined && <Row label="body">{bodyText(received.body)}</Row>}
            {trace?.variables !== undefined && (
              <Row label="variables, as the proxy read them">{trace.variables}</Row>
            )}
          </Leg>
          {trace !== undefined && <ApiLeg trace={trace} />}
          {trace?.rid !== undefined && (
            <p className="m-0 text-[11.5px] text-fg-subtle">
              <code className="font-mono text-fg-muted">X-Courier-Rid: {trace.rid}</code> — the same
              request, in your browser&apos;s developer tools under Network, with this id among its
              answer&apos;s headers.
            </p>
          )}
          {trace === undefined && !request.action && !request.unanswered && (
            <p className="m-0 text-[11.5px] text-fg-subtle">
              The site&apos;s server told nothing more of this request.
            </p>
          )}
        </div>
      </details>
    </li>
  )
}
