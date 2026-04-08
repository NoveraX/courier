/**
 * SetupSteps + ProgressHeader sub-components.
 */

import type { FrameworkConfig } from "./frameworks";

import { StepCard } from "./step-card";

interface SetupStepsProps {
  framework: FrameworkConfig;
  completed: Set<string>;
  currentId: string | null;
  onAction: (id: string) => void;
  onUndo: (id: string) => void;
  onBack: () => void;
}

export function SetupSteps({
  framework,
  completed,
  currentId,
  onAction,
  onUndo,
  onBack,
}: SetupStepsProps): React.ReactElement {
  const completedCount = framework.steps.filter((s) => completed.has(s.id)).length;
  const total = framework.steps.length;
  const pct = (completedCount / total) * 100;
  const allDone = completedCount === total;

  return (
    <>
      <ProgressHeader
        completedCount={completedCount}
        total={total}
        allDone={allDone}
        pct={pct}
        onBack={onBack}
      />
      <div className="space-y-3">
        {framework.steps.map((step, i) => (
          <StepCard
            key={step.id}
            step={step}
            index={i}
            isCompleted={completed.has(step.id)}
            isActive={step.id === currentId}
            onAction={() => onAction(step.id)}
            onUndo={() => onUndo(step.id)}
          />
        ))}
      </div>
    </>
  );
}

interface ProgressHeaderProps {
  completedCount: number;
  total: number;
  allDone: boolean;
  pct: number;
  onBack: () => void;
}

function ProgressHeader({
  completedCount,
  total,
  allDone,
  pct,
  onBack,
}: ProgressHeaderProps): React.ReactElement {
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 text-body-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Change framework
      </button>
      <div className="flex items-center justify-between text-body-xs">
        {allDone ? (
          <span className="font-medium text-success-foreground">All done!</span>
        ) : (
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{completedCount}</span> of {total} completed
          </span>
        )}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent-brand transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
