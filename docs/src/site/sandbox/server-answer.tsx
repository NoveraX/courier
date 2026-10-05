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
      <div className="flex h-9.5 items-center gap-2.5 border-b border-line bg-bg-subtle px-3.5">
        <span className="min-w-0 truncate font-mono text-label text-fg-muted">{label}</span>
        <span className="ml-auto font-mono text-micro tracking-[0.06em] text-fg-subtle">
          RENDERED ON THE SERVER
        </span>
      </div>
      <div className="p-4.5">
        <ResponseView data={data} />
      </div>
    </div>
  )
}
