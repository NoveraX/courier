import { serverSummary } from "./summary"
import type { CallTrace } from "./trace"
import { ApiLeg } from "./trace-parts"

/**
 * A call made on the site's server — as the page rendered, or in a Server
 * Action — as the server traced it: where it was made and how its way to
 * the API went, in a line of words, opening on that leg. No request of
 * the browser's carried the call.
 *
 * @param props - The call's trace
 * @returns The trace, as a region of its own
 * @example
 * ```tsx
 * <ServerTrace trace={users.trace} />
 * ```
 */
export function ServerTrace({ trace }: { trace: CallTrace }) {
  return (
    <section
      aria-label="The call on the server"
      className="min-w-0 rounded-control border border-line bg-panel"
    >
      <details open>
        <summary className="px-3 py-2 font-mono text-[12px] text-fg-muted [overflow-wrap:anywhere] marker:text-fg-subtle">
          {serverSummary(trace)}
        </summary>
        <div className="border-t border-line px-3 py-3">
          <ApiLeg trace={trace} />
        </div>
      </details>
    </section>
  )
}
