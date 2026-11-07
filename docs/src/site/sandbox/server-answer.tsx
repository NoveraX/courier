import { BreakableText } from "@/site/code/breakable-text"
import { ServerTrace } from "@/site/inspector/server-trace"
import type { CallTrace } from "@/site/inspector/trace"
import { ResponseView } from "./response-view"
import type { ServerAnswer as Answer } from "./server-call"

interface ServerAnswerProps {
  /** The call, as its header names it. */
  label: string
  /** What it came to: its data, or the refusal it was answered with. */
  answer: Answer<unknown>
  /** How its way to the API went, as the site's server traced it. */
  trace?: CallTrace | undefined
}

/**
 * What a call made while the page rendered on the server answered — no
 * request left the browser for it: its data, or the refusal it was
 * answered with, status and message — and, under it, how its way to the
 * API went, as the server traced it.
 *
 * @param props - The call's name, what it came to and its trace
 * @returns The panel
 * @example
 * ```tsx
 * <ServerAnswer label="caller.users.getAll()" {...await traced("render", () => caller.users.getAll())} />
 * ```
 */
export function ServerAnswer({ label, answer, trace }: ServerAnswerProps) {
  return (
    <section
      aria-label={label}
      className="overflow-hidden rounded-panel border border-line bg-panel shadow-panel"
    >
      <div className="flex min-h-9.5 items-center gap-2.5 border-b border-line bg-bg-subtle px-3.5 py-1.5">
        <span className="min-w-0 font-mono text-label wrap-break-word text-fg-muted">
          <BreakableText text={label} after="." />
        </span>
        <span className="ml-auto shrink-0 font-mono text-micro tracking-[0.06em] text-fg-subtle">
          RENDERED ON THE SERVER
        </span>
      </div>
      <div className="flex flex-col gap-3.5 p-4.5">
        <ResponseView data={answer.data} error={answer.error} status={answer.status} />
        {trace !== undefined && <ServerTrace trace={trace} />}
      </div>
    </section>
  )
}
