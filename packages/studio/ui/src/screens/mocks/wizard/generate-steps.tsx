import type { MockWizardState } from "@/features/mocks/wizard/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "source", label: "Sources" },
  { key: "configure", label: "Configure" },
  { key: "review", label: "Review" },
] as const;

interface GenerateStepsProps {
  state: MockWizardState;
  /** Whether an apply is in flight, when no step can be gone back to. */
  applying: boolean;
  onBack: (step: "source" | "configure") => void;
}

/**
 * The wizard's steps as a bar each — Sources, Configure, Review — filled up
 * to the one in hand; a step done goes back to, until the change is
 * applied.
 *
 * @param props - The wizard, whether an apply is in flight, and what going back does
 * @returns The steps
 * @example
 * ```tsx
 * <GenerateSteps state={state} applying={false} onBack={(step) => dispatch({ type: "goTo", step })} />
 * ```
 */
export function GenerateSteps({ state, applying, onBack }: GenerateStepsProps): React.ReactNode {
  const current =
    state.step === "done" ? STEPS.length : STEPS.findIndex((step) => step.key === state.step);
  return (
    <ol aria-label="Steps" className="m-0 grid list-none grid-cols-3 gap-2 p-0">
      {STEPS.map((step, i) => {
        const on = i === current;
        const target =
          step.key === "review" || i >= current || state.step === "done" || applying
            ? null
            : step.key;
        return (
          <li key={step.key}>
            <button
              type="button"
              disabled={target === null}
              aria-current={on ? "step" : undefined}
              onClick={() => target && onBack(target)}
              className="flex w-full flex-col gap-1.75 text-left enabled:cursor-pointer disabled:cursor-default"
            >
              <span
                className={cn("h-0.75 rounded-full", i <= current ? "bg-brand" : "bg-raised")}
              />
              <span
                className={cn(
                  "flex items-center gap-1.5 text-small",
                  on
                    ? "font-semibold text-fg"
                    : i < current
                      ? "font-medium text-fg-muted"
                      : "font-medium text-fg-subtle",
                )}
              >
                <span
                  className={cn(
                    "font-mono text-meta",
                    i <= current ? "text-brand" : "text-fg-subtle",
                  )}
                >{`0${i + 1}`}</span>
                {step.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
