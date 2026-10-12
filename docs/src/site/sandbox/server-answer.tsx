import { BreakableText } from "@/site/code/breakable-text"
import { ResponseView } from "./response-view"

/**
 * What a call made while the page rendered on the server answered — no
 * request left the browser for it.
 *
 * @param props - The call's name and its answer
 * @returns The panel
 * @example
 * ```tsx
 * <ServerAnswer label="caller.users.getAll()" data={await caller.users.getAll()} />
 * ```
 */
export function ServerAnswer({ label, data }: { label: string; data: unknown }) {
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-panel shadow-panel">
      <div className="flex min-h-9.5 items-center gap-2.5 border-b border-line bg-bg-subtle px-3.5 py-1.5">
        <span className="min-w-0 font-mono text-label wrap-break-word text-fg-muted">
          <BreakableText text={label} after="." />
        </span>
        <span className="ml-auto shrink-0 font-mono text-micro tracking-[0.06em] text-fg-subtle">
          RENDERED ON THE SERVER
        </span>
      </div>
      <div className="p-4.5">
        <ResponseView data={data} />
      </div>
    </div>
  )
}
