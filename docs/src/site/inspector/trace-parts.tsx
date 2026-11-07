import type { ReactNode } from "react"

import { API_NAME, attemptOutcome, duration } from "./summary"
import type { CallTrace } from "./trace"

/**
 * A size in bytes as the inspector writes it.
 *
 * @param count - The bytes
 * @returns The size, in words
 * @example
 * ```ts
 * bytes(1536) // "1.5 KB"
 * ```
 */
export function bytes(count: number): string {
  if (count < 1024) return `${count} B`
  if (count < 1024 * 1024) return `${(count / 1024).toFixed(1)} KB`
  return `${(count / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * A request's body as a trace writes it — `application/json 86` — in words.
 *
 * @param body - The body's type and length
 * @returns Them, in words
 * @example
 * ```ts
 * bodyText("application/json 86") // "application/json · 86 B"
 * ```
 */
export function bodyText(body: string): string {
  const [type, length] = body.split(" ")
  return `${type} · ${length === "streamed" ? "length not given: sent as it came" : bytes(Number(length))}`
}

/** One leg of a call's way: where it went from and to, and what went along it. */
export function Leg({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="m-0 font-mono text-label text-fg">{title}</p>
      <p className="m-0 mt-0.5 mb-1.5 text-[11.5px] text-fg-subtle">{note}</p>
      <dl className="m-0 grid gap-1">{children}</dl>
    </div>
  )
}

/** One fact of a leg, under its name; the narrow screen stacks them. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-3 min-[560px]:grid-cols-[150px_minmax(0,1fr)]">
      <dt className="text-[11.5px] text-fg-subtle">{label}</dt>
      <dd className="m-0 min-w-0 font-mono text-[12px] text-fg-muted [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  )
}

/* How many more names a list had than it shows, as its last item says it: `+5`. */
const MORE = /^\+(\d+)$/

/** Header names, each in the code face, wrapping as the line runs out; then how many more. */
export function Names({ names }: { names: readonly string[] }) {
  return (
    <span className="flex flex-wrap items-baseline gap-1">
      {names.map((name) => {
        const more = MORE.exec(name)?.[1]
        if (more !== undefined) return <span key={name}>and {more} more</span>
        return (
          <code key={name} className="rounded-chip bg-raised px-1.5 py-px text-[11px]">
            {name}
          </code>
        )
      })}
    </span>
  )
}

const FROM = {
  proxy: "/api/request",
  render: "The page, rendering on the server",
  action: "The Server Action, on the server",
} as const

/**
 * The way from the site's server to the API, as the server told it: each
 * request it made with how it ended, the headers it sent and those it got
 * back — names alone — the chain the call ran through, what it logged, what
 * the cache made of it, and how the server answered.
 *
 * @param props - The call's trace
 * @returns The leg
 * @example
 * ```tsx
 * <ApiLeg trace={trace} />
 * ```
 */
export function ApiLeg({ trace }: { trace: CallTrace }) {
  const many = trace.attempts.length > 1
  return (
    <Leg
      title={`${FROM[trace.site]} → ${API_NAME}`}
      note="as the site's server told it: names, never values"
    >
      {trace.attempts.length === 0 && <Row label="request">none: the API was not called</Row>}
      {trace.attempts.map((attempt, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a trace's lists are made once, in the order things happened, and never reordered
        <Row key={index} label={many ? `attempt ${index + 1}` : "request"}>
          {attempt.method} {attempt.target} → {attemptOutcome(attempt)}
          {many && <span className="text-fg-subtle"> · sent at +{duration(attempt.at)}</span>}
        </Row>
      ))}
      {trace.variables !== undefined && trace.site !== "proxy" && (
        <Row label="variables">{trace.variables}</Row>
      )}
      {trace.sent.length > 0 && (
        <Row label="headers Courier sent">
          <Names names={trace.sent} />
        </Row>
      )}
      {trace.answered.length > 0 && (
        <Row label="headers the API answered with">
          <Names names={trace.answered} />
        </Row>
      )}
      {trace.chain.length > 0 && (
        <Row label="middleware, in order">
          <ol className="m-0 list-decimal pl-4">
            {trace.chain.map((link, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a trace's lists are made once, in the order things happened, and never reordered
              <li key={index}>
                {link.name} · {link.phase} · {duration(link.ms)}
                {link.added.length > 0 && ` · added ${link.added.join(", ")}`}
              </li>
            ))}
          </ol>
        </Row>
      )}
      {trace.log.length > 0 && (
        <Row label="logged">
          {trace.log.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a trace's lists are made once, in the order things happened, and never reordered
            <span key={index} className="block">
              {line}
            </span>
          ))}
        </Row>
      )}
      {trace.cache.length > 0 && <Row label="server's cache">{trace.cache.join(" · ")}</Row>}
      {trace.site === "proxy" && trace.status !== undefined && (
        <Row label="the route answered">
          {trace.status}
          {trace.ms !== undefined && ` · ${duration(trace.ms)} on the server`}
        </Row>
      )}
      {trace.passedBack.length > 0 && (
        <Row label="headers back to the browser">
          <Names names={trace.passedBack} />
        </Row>
      )}
      {trace.cut > 0 && <Row label="left out">{trace.cut}, past the inspector's limits</Row>}
    </Leg>
  )
}
