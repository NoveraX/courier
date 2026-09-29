/**
 * Presentational sub-components used by StepCard.
 *
 * Extracted so the main `step-card.tsx` file can focus on layout and
 * action handling. Each part here has a single responsibility:
 *  - StepHeader: title + description text
 *  - VariantTabs: tab switcher for code variants (Turbopack vs Webpack, etc.)
 *  - FilePathHint: small filename hint above the code block
 *  - StepIndicator: numbered/checked dot on the left side of each step
 */

import { CircleCheck, FileCode2 } from "lucide-react";

import { cn } from "@/lib/utils";

import type { CodeVariant, SetupStep } from "./frameworks";

interface StepHeaderProps {
  step: SetupStep;
  isCompleted: boolean;
  isActive: boolean;
}

export function StepHeader({ step, isCompleted, isActive }: StepHeaderProps): React.ReactElement {
  return (
    <>
      <p
        className={cn(
          "text-body-sm font-medium leading-6",
          isCompleted && "text-muted-foreground/50 line-through",
          isActive && "text-foreground",
          !isCompleted && !isActive && "text-muted-foreground",
        )}
      >
        {step.title}
      </p>
      <p
        className={cn(
          "mt-0.5 text-body-xs leading-5",
          isActive ? "text-muted-foreground" : "text-muted-foreground/60",
        )}
      >
        {step.description}
      </p>
    </>
  );
}

interface VariantTabsProps {
  variants: CodeVariant[];
  activeIdx: number;
  onChange: (idx: number) => void;
}

export function VariantTabs({
  variants,
  activeIdx,
  onChange,
}: VariantTabsProps): React.ReactElement {
  return (
    <div className="mt-3 flex gap-1 rounded-lg bg-muted/50 p-0.5">
      {variants.map((v, i) => (
        <button
          key={v.label}
          type="button"
          onClick={() => onChange(i)}
          className={cn(
            "flex-1 rounded-md px-3 py-1 text-body-xs font-medium transition-colors",
            i === activeIdx
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

interface FilePathHintProps {
  path: string;
}

export function FilePathHint({ path }: FilePathHintProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground/70">
      <FileCode2 className="size-3" />
      <code className="mono-sm">{path}</code>
    </div>
  );
}

interface StepIndicatorProps {
  index: number;
  isCompleted: boolean;
  isActive: boolean;
}

export function StepIndicator({
  index,
  isCompleted,
  isActive,
}: StepIndicatorProps): React.ReactElement {
  if (isCompleted) {
    return (
      <div className="flex size-7 items-center justify-center">
        <CircleCheck className="size-7 text-success-foreground" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
        isActive ? "bg-accent-brand text-white" : "bg-muted text-muted-foreground",
      )}
    >
      {index + 1}
    </div>
  );
}
