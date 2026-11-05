import { BreakableText } from "@/site/code/breakable-text"
import { ResponseView } from "./response-view"
import type { ServerAnswer as Answer } from "./server-call"

/**
 * What a call made while the page rendered on the server answered — no
 * request left the browser for it: its data, or the refusal it was
 * answered with, status and message.
 *
 * @param props - The call's name and what it came to
 * @returns The panel
 * @example
 * ```tsx
 * <ServerAnswer label="caller.users.getAll()" answer={await answerOf(caller.users.getAll())} />
 * ```
 */
export function ServerAnswer({ label, answer }: { label: string; answer: Answer<unknown> }) {
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
      <div className="p-4.5">
        <ResponseView data={answer.data} error={answer.error} status={answer.status} />
      </div>
    </section>
  )
}
