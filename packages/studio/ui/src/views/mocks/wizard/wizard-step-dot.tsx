import { cn } from "@/lib/utils";

interface WizardStepDotProps {
  label: string;
  index: number;
  active: boolean;
  completed: boolean;
  onClick?: () => void;
}

/**
 * One step in the wizard's header: its number, or a check once it is done,
 * and its label. A done step the wizard can go back to is a button.
 *
 * @param props - The step's label and position, whether it is current or done, and how to go back to it
 * @returns The step, after a line joining it to the one before
 *
 * @example
 * ```tsx
 * <WizardStepDot label="Configure" index={1} active completed={false} />
 * ```
 */
export function WizardStepDot({
  label,
  index,
  active,
  completed,
  onClick,
}: WizardStepDotProps): React.ReactElement {
  return (
    <>
      {index > 0 && (
        <div
          className={cn(
            "h-px flex-1 transition-colors",
            completed ? "bg-accent-brand" : "bg-border-subtle",
          )}
        />
      )}
      <button
        type="button"
        disabled={!onClick}
        onClick={onClick}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all",
          active && "bg-accent-brand/15 text-accent-brand ring-1 ring-accent-brand/30",
          completed && "text-accent-brand cursor-pointer hover:bg-accent-brand/10",
          !active && !completed && "text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-full text-[9px] font-bold",
            active && "bg-accent-brand text-white",
            completed && "bg-accent-brand/20 text-accent-brand",
            !active && !completed && "bg-muted/60 text-muted-foreground",
          )}
        >
          {completed ? "✓" : index + 1}
        </span>
        {label}
      </button>
    </>
  );
}
