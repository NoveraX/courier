import { cn } from "@/site/cn"
import { REFACTOR_STEPS } from "./refactor-code"
import type { StepState } from "./refactor-frame"

const LOOK: Readonly<Record<StepState, { row: string; tone: string; title: string }>> = {
  idle: { row: "border-line", tone: "border-line-strong text-line-strong", title: "text-fg-muted" },
  active: {
    row: "border-tone-red/40 bg-tone-red/6",
    tone: "border-tone-red text-tone-red",
    title: "text-fg",
  },
  done: {
    row: "border-line",
    tone: "border-fg-subtle text-fg-subtle",
    title: "text-fg-subtle line-through decoration-tone-red/60",
  },
  won: { row: "border-ok/40 bg-ok/7", tone: "border-ok text-ok", title: "text-fg" },
}

/**
 * The refactor's steps beside the code: each struck through once done,
 * the one under way in red, the last in green once the new lines are in.
 *
 * @param props - Where each step stands
 * @returns The steps
 * @example
 * ```tsx
 * <RefactorSteps states={frame.steps} />
 * ```
 */
export function RefactorSteps({ states }: { states: readonly StepState[] }) {
  return (
    <ol className="m-0 mt-6.5 flex list-none flex-col gap-1.5 p-0">
      {REFACTOR_STEPS.map((step, at) => {
        const state = states[at] ?? "idle"
        const look = LOOK[state]
        return (
          <li
            key={step.title}
            className={cn(
              "flex items-center gap-3 rounded-[11px] border px-3 py-2.5 transition-all duration-350 motion-reduce:transition-none",
              look.row
            )}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border font-mono text-micro tracking-normal transition-all duration-350 motion-reduce:transition-none",
                look.tone
              )}
            >
              {state === "done" || state === "won" ? "✓" : at + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-nav transition-colors duration-350 motion-reduce:transition-none",
                  look.title
                )}
              >
                {step.title}
              </span>
              <span className="mt-0.5 block text-label text-fg-subtle">{step.sub}</span>
            </span>
            <span className={cn("shrink-0 font-mono text-[11px] tracking-normal", look.tone)}>
              {step.delta}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
