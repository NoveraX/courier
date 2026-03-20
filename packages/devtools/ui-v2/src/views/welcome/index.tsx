import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { useDevToolsStore } from "@/store";
import { restartTour } from "@/components/onboarding/tour-provider";

import { FrameworkPicker } from "./framework-picker";
import { FRAMEWORKS, WELCOME_STORAGE_KEY } from "./frameworks";
import { StepCard } from "./step-card";

import type { FrameworkConfig } from "./frameworks";

// ── Helpers ─────────────────────────────────────────────────────────────────

function isWelcomeCompleted(): boolean {
  try { return localStorage.getItem(WELCOME_STORAGE_KEY) === "true"; } catch { return true; }
}

function markWelcomeCompleted(): void {
  try { localStorage.setItem(WELCOME_STORAGE_KEY, "true"); } catch { /* noop */ }
}

// ── Welcome view ────────────────────────────────────────────────────────────

export function WelcomeView(): React.ReactNode {
  const navigate = useNavigate();
  const { framework: frameworkId } = useSearch({ from: "/" });
  const connected = useDevToolsStore((s) => s.connected);
  const sessions = useDevToolsStore((s) => s.sessions);

  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const framework = FRAMEWORKS.find((f) => f.id === frameworkId) ?? null;

  // Reset completed steps when framework changes
  useEffect(() => { setCompleted(new Set()); }, [frameworkId]);

  // Auto-complete "connect" step when socket connects with app session
  useEffect(() => {
    if (connected && sessions.length > 0 && !completed.has("connect")) {
      setCompleted((prev) => new Set(prev).add("connect"));
    }
  }, [connected, sessions.length, completed]);

  const currentId = framework?.steps.find((s) => !completed.has(s.id))?.id ?? null;

  const selectFramework = useCallback((id: string) => {
    navigate({ to: "/", search: { framework: id } });
  }, [navigate]);

  const goBack = useCallback(() => {
    navigate({ to: "/", search: {} });
  }, [navigate]);

  const handleAction = useCallback((stepId: string) => {
    if (stepId === "explore") {
      markWelcomeCompleted();
      navigate({ to: "/timeline" });
      // Start the feature tour after a short delay (let the page render first)
      setTimeout(restartTour, 800);
      return;
    }
    setCompleted((prev) => new Set(prev).add(stepId));
  }, [navigate]);

  const handleUndo = useCallback((stepId: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.delete(stepId);
      return next;
    });
  }, []);

  // Skip welcome if already completed
  if (isWelcomeCompleted()) {
    return <RedirectToTimeline />;
  }

  return (
    <div className="flex flex-1 justify-center overflow-y-auto p-6">
      <div className="my-auto w-full max-w-2xl">
        <div className="mb-6">
          <h3 className="text-h2 text-foreground">Set up Nexus DevTools</h3>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {framework
              ? `Follow the steps below to connect your ${framework.name} app`
              : "Choose your framework to get started"}
          </p>
        </div>

        {!framework ? (
          <FrameworkPicker onSelect={selectFramework} />
        ) : (
          <SetupSteps
            framework={framework}
            completed={completed}
            currentId={currentId}
            onAction={handleAction}
            onUndo={handleUndo}
            onBack={goBack}
          />
        )}
      </div>
    </div>
  );
}

// ── Setup steps ─────────────────────────────────────────────────────────────

function SetupSteps({ framework, completed, currentId, onAction, onUndo, onBack }: {
  framework: FrameworkConfig;
  completed: Set<string>;
  currentId: string | null;
  onAction: (id: string) => void;
  onUndo: (id: string) => void;
  onBack: () => void;
}): React.ReactElement {
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

// ── Progress header ─────────────────────────────────────────────────────────

function ProgressHeader({ completedCount, total, allDone, pct, onBack }: {
  completedCount: number;
  total: number;
  allDone: boolean;
  pct: number;
  onBack: () => void;
}): React.ReactElement {
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

// ── Redirect ────────────────────────────────────────────────────────────────

function RedirectToTimeline(): React.ReactNode {
  const navigate = useNavigate();
  useEffect(() => { navigate({ to: "/timeline" }); }, [navigate]);
  return null;
}
