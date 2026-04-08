/**
 * Step indicator dot used in the mock wizard header.
 *
 * Extracted from `mock-generator-wizard.tsx` so the wizard component file
 * focuses on layout. Renders the connecting line, the numbered/checked
 * circle, and the label, with click-to-jump enabled only on completed steps.
 */

import { cn } from "@/lib/utils";

interface WizardStepDotProps {
  label: string;
  index: number;
  active: boolean;
  completed: boolean;
  onClick?: () => void;
}

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
