import type { ReactNode } from "react"

interface SandboxProps {
  /** What the sandbox calls, as its header names it. */
  label: string
  /** The inputs and the button that sends the call. */
  controls: ReactNode
  /** What the call answered. */
  result: ReactNode
}

/**
 * A call to try on the page: its name, the inputs and the button that sends
 * it on the left, what it answered on the right — stacked on a narrow
 * screen.
 *
 * @param props - The call's name, its controls and its result
 * @returns The sandbox
 * @example
 * ```tsx
 * <Sandbox label="caller.users.getAll" controls={<RunButton onClick={run} />} result={<ResponseView data={data} />} />
 * ```
 */
export function Sandbox({ label, controls, result }: SandboxProps) {
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-panel shadow-panel">
      <div className="flex h-9.5 items-center gap-2.5 border-b border-line bg-bg-subtle px-3.5">
        <span className="min-w-0 truncate font-mono text-label text-fg-muted">{label}</span>
        <span className="ml-auto font-mono text-micro tracking-[0.06em] text-fg-subtle">
          SANDBOX
        </span>
      </div>
      <div className="grid grid-cols-1 min-[760px]:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3.5 border-b border-line p-4.5 min-[760px]:border-r min-[760px]:border-b-0">
          {controls}
        </div>
        <div className="min-w-0 p-4.5">{result}</div>
      </div>
    </div>
  )
}
