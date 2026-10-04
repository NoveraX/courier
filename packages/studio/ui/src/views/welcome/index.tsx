/**
 * WelcomeView entry point — drives framework selection, step progression,
 * and the completion handoff to the timeline view.
 *
 * A project whose app is attached already is set up: the page hands over to
 * the Timeline unless the setup was asked for — from Settings, or by picking
 * a framework.
 */

import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { restartTour } from "@/components/onboarding/tour-provider";
import { FRAMEWORKS } from "@/features/welcome/frameworks";
import { isWelcomeCompleted, markWelcomeCompleted } from "@/features/welcome/welcome-storage";
import { useStudioStore } from "@/store";
import { FrameworkPicker } from "./framework-picker";
import { SetupSteps } from "./setup-steps";

export function WelcomeView(): React.ReactNode {
  const navigate = useNavigate();
  const { framework: frameworkId, setup } = useSearch({ from: "/" });
  const connected = useStudioStore((s) => s.connected);
  const runtimeCount = useStudioStore((s) => s.bindingSnapshot.runtimeCount);

  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const framework = FRAMEWORKS.find((f) => f.id === frameworkId) ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: choosing another framework is what starts its steps afresh
  useEffect(() => {
    setCompleted(new Set());
  }, [frameworkId]);

  // Auto-complete "connect" step when socket connects and a runtime announces
  useEffect(() => {
    if (connected && runtimeCount > 0 && !completed.has("connect")) {
      setCompleted((prev) => new Set(prev).add("connect"));
    }
  }, [connected, runtimeCount, completed]);

  const currentId = framework?.steps.find((s) => !completed.has(s.id))?.id ?? null;

  const selectFramework = useCallback(
    (id: string) => {
      navigate({ to: "/", search: { framework: id, ...(setup && { setup: true }) } });
    },
    [navigate, setup],
  );

  const goBack = useCallback(() => {
    navigate({ to: "/", search: setup ? { setup: true } : {} });
  }, [navigate, setup]);

  const handleAction = useCallback(
    (stepId: string) => {
      if (stepId === "explore") {
        markWelcomeCompleted();
        navigate({ to: "/timeline" });
        // Start the feature tour after a short delay (let the page render first)
        setTimeout(restartTour, 800);
        return;
      }
      setCompleted((prev) => new Set(prev).add(stepId));
    },
    [navigate],
  );

  const handleUndo = useCallback((stepId: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.delete(stepId);
      return next;
    });
  }, []);

  if (isWelcomeCompleted()) {
    return <RedirectToTimeline />;
  }
  if (connected && runtimeCount > 0 && !frameworkId && !setup) {
    return <RedirectToTimeline complete />;
  }

  return (
    <div className="flex flex-1 justify-center overflow-y-auto p-6">
      <div className="my-auto w-full max-w-2xl">
        <div className="mb-6">
          <h3 className="text-h2 text-foreground">Set up Courier Studio</h3>
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

/* `complete` records the setup as done, so a later visit goes straight on. */
function RedirectToTimeline({ complete = false }: { complete?: boolean }): React.ReactNode {
  const navigate = useNavigate();
  useEffect(() => {
    if (complete) markWelcomeCompleted();
    navigate({ to: "/timeline" });
  }, [navigate, complete]);
  return null;
}
