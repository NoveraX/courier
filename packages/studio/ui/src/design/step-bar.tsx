import { cn } from "@/lib/utils";

interface StepBarProps<TKey extends string> {
  steps: readonly { key: TKey; label: string }[];
  /** The step in hand, by position; past the last when every step is done. */
  current: number;
  /** Whether a step done can be gone back to. */
  canGoBack: (key: TKey) => boolean;
  onBack: (key: TKey) => void;
}

/* What a phone shows under the bars, which have no room for their labels. */
function stepSummary(steps: readonly { label: string }[], current: number): string {
  const step = steps[current];
  if (!step) return `All ${steps.length} steps done`;
  return `Step ${current + 1} of ${steps.length} · ${step.label}`;
}

/**
 * A dialog's steps as a bar each, numbered and filled up to the one in
 * hand; a step done that can be gone back to is a button. On a phone the
 * bars stand without their labels, and a line under them names the step
 * in hand.
 *
 * @param props - The steps, the one in hand, which can be gone back to, and what going back does
 * @returns The steps
 * @example
 * ```tsx
 * <StepBar steps={STEPS} current={1} canGoBack={() => true} onBack={goTo} />
 * ```
 */
export function StepBar<TKey extends string>({
  steps,
  current,
  canGoBack,
  onBack,
}: StepBarProps<TKey>): React.ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <ol
        aria-label="Steps"
        className="m-0 grid list-none gap-2 p-0"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => {
          const on = i === current;
          const back = i < current && canGoBack(step.key);
          return (
            <li key={step.key}>
              <button
                type="button"
                disabled={!back}
                aria-current={on ? "step" : undefined}
                onClick={() => onBack(step.key)}
                className="flex w-full flex-col gap-1.75 text-left enabled:cursor-pointer disabled:cursor-default max-sm:min-h-6 max-sm:justify-center"
              >
                <span
                  className={cn(
                    "h-0.75 rounded-full transition-colors duration-200",
                    i <= current ? "bg-brand" : "bg-raised",
                  )}
                />
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-small max-sm:sr-only",
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
      <p aria-hidden="true" className="hidden text-small font-semibold text-fg max-sm:block">
        {stepSummary(steps, current)}
      </p>
    </div>
  );
}
