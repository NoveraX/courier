/**
 * Per-step indicator (numbered dot + connector) for the import wizard.
 *
 * Extracted to its own file so styling and a11y semantics can evolve
 * without touching the wizard layout.
 */

import { cn } from "@/lib/utils";

interface StepDotProps {
  label: string;
  index: number;
  active: boolean;
  completed: boolean;
  onClick?: () => void;
}

export function StepDot({
  label,
  index,
  active,
  completed,
  onClick,
}: StepDotProps): React.ReactElement {
  return (
    <>
      {index > 0 && (
        <div className={cn(
          "h-px flex-1 transition-colors",
          completed ? "bg-accent-brand" : "bg-border-subtle",
        )} />
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all",
          active && "bg-accent-brand/15 text-accent-brand ring-1 ring-accent-brand/30",
          completed && "text-accent-brand cursor-pointer hover:bg-accent-brand/10",
          !active && !completed && "text-muted-foreground",
        )}
      >
        <span className={cn(
          "flex size-4 items-center justify-center rounded-full text-[9px] font-bold",
          active && "bg-accent-brand text-white",
          completed && "bg-accent-brand/20 text-accent-brand",
          !active && !completed && "bg-muted/60 text-muted-foreground",
        )}>
          {completed ? "✓" : index + 1}
        </span>
        {label}
      </button>
    </>
  );
}
