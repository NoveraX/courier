import { Boxes } from "lucide-react"

import type { EntryPoint } from "@/site/content/reference-modules"

/**
 * Where Courier's exports are imported from: each module, and the exports
 * a project reaches for there.
 *
 * @param props - The modules
 * @returns The table
 * @example
 * ```tsx
 * <EntryPointsTable entryPoints={ENTRY_POINTS} />
 * ```
 */
export function EntryPointsTable({ entryPoints }: { entryPoints: readonly EntryPoint[] }) {
  return (
    <div className="mt-8 overflow-hidden rounded-dialog border border-line bg-panel shadow-panel">
      <div className="flex h-10.5 items-center gap-2 border-b border-line bg-bg-subtle px-4 font-mono text-micro tracking-[0.08em] text-fg-subtle">
        <Boxes aria-hidden="true" className="size-3.25" />
        ENTRY POINTS
      </div>
      {entryPoints.map(({ module, note }) => (
        <div
          key={module}
          className="grid items-baseline gap-1 border-b border-line px-4 py-3.25 last:border-b-0 hover:bg-bg-subtle min-[760px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
        >
          <code className="text-small [overflow-wrap:anywhere] text-fg">
            <span className="text-code-keyword">from</span>{" "}
            <span className="text-code-string">&quot;{module}&quot;</span>
          </code>
          <span className="text-nav text-fg-muted">{note}</span>
        </div>
      ))}
    </div>
  )
}
