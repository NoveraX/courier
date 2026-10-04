import { cn } from "@/lib/utils";

interface StepNodeProps {
  number: number;
  done: boolean;
  current: boolean;
  failed: boolean;
  /** Rings outward while the step waits on something outside the page. */
  waiting?: boolean | undefined;
}

/**
 * A setup step's marker: its number, a tick once done, `!` when it failed —
 * in the brand colour while it is the one to do.
 *
 * @param props - The step's number and state
 * @returns The marker
 * @example
 * ```tsx
 * <StepNode number={1} done={false} current failed={false} />
 * ```
 */
export function StepNode({
  number,
  done,
  current,
  failed,
  waiting,
}: StepNodeProps): React.ReactNode {
  return (
    <div className="relative size-6.5">
      {waiting && (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-ripple rounded-full border border-brand"
        />
      )}
      <div
        className={cn(
          "relative flex size-6.5 items-center justify-center rounded-full border font-mono text-badge font-semibold transition-all duration-250",
          failed && "border-err bg-err-dim text-err",
          !failed && done && "border-brand bg-brand text-bg",
          !failed && !done && current && "border-brand bg-brand-dim text-brand",
          !failed && !done && !current && "border-line-strong text-fg-subtle",
        )}
      >
        {failed ? "!" : done ? "✓" : String(number).padStart(2, "0")}
      </div>
    </div>
  );
}
