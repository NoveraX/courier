import { cn } from "@/site/cn"
import { SETUP_STEPS } from "./setup-data"

/**
 * The setup's steps as buttons: the one shown raised, the ones done
 * ticked. On a narrow screen they sit in a row without their text.
 *
 * @param props - The step shown, and what picks one
 * @returns The steps
 * @example
 * ```tsx
 * <SetupSteps current={1} onPick={setStep} />
 * ```
 */
export function SetupSteps({
  current,
  onPick,
}: {
  current: number
  onPick: (step: number) => void
}) {
  return (
    <ol className="m-0 flex list-none gap-1.5 border-b border-line bg-bg-subtle p-2.5 min-[900px]:flex-col min-[900px]:border-r min-[900px]:border-b-0 min-[900px]:p-3.5">
      {SETUP_STEPS.map((step, at) => {
        const on = at === current
        const done = at < current
        return (
          <li key={step.title} className="min-w-0 flex-1 min-[900px]:flex-none">
            <button
              type="button"
              aria-current={on ? "step" : undefined}
              onClick={() => onPick(at)}
              className={cn(
                "flex w-full cursor-pointer flex-col items-center gap-2 rounded-panel border px-1.5 py-2.5 text-center transition-colors hover:border-line-strong min-[560px]:flex-row min-[560px]:items-start min-[560px]:gap-3 min-[560px]:p-3 min-[560px]:text-left",
                on ? "border-line-strong bg-panel" : "border-transparent bg-transparent"
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border font-mono text-[11.5px] font-semibold",
                  done && "border-brand bg-brand text-bg",
                  on && "border-brand bg-brand-dim text-brand",
                  !done && !on && "border-line-strong text-fg-subtle"
                )}
              >
                {done ? "✓" : `0${at + 1}`}
              </span>
              <span className="flex min-w-0 flex-col gap-0.75 min-[560px]:pt-1">
                <span className="text-nav font-semibold min-[560px]:truncate">{step.title}</span>
                <span className="hidden text-small leading-normal text-fg-subtle min-[900px]:block">
                  {step.text}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
