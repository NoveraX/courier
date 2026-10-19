import { Navigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";

import { attachedApps } from "@/features/runtimes/attached-apps";
import { detectFramework } from "@/features/welcome/detect-framework";
import { FRAMEWORKS } from "@/features/welcome/frameworks";
import { setupProgress } from "@/features/welcome/setup-progress";
import { useSetupStore } from "@/features/welcome/setup-store";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useStudioStore } from "@/store";
import { FrameworkGrid } from "./framework-grid";
import { LiveCapture } from "./live-capture";
import { StepsCard } from "./steps-card";

/**
 * The setup: pick the framework — the one the project's packages tell is
 * picked until another is — follow its steps, each complete as its command
 * or snippet is copied and the connect step once an app attaches, and watch
 * the first requests arrive beside it. A project set up already goes on to
 * the Timeline, unless the setup was asked for; until Studio has said
 * whether an app is attached, the page waits to know which it shows.
 *
 * @returns The screen
 * @example
 * ```tsx
 * export const Route = createFileRoute("/")({ component: WelcomeScreen });
 * ```
 */
export function WelcomeScreen(): React.ReactNode {
  const { framework: fromLink, setup } = useSearch({ from: "/" });
  const frameworkId = useSetupStore((s) => s.frameworkId);
  const copied = useSetupStore((s) => s.copied);
  const select = useSetupStore((s) => s.select);
  const completed = useSetupStore((s) => s.completed);
  const complete = useSetupStore((s) => s.complete);
  const snapshot = useStudioStore((s) => s.bindingSnapshot);
  const dependencies = useStudioStore((s) => s.studioInfo?.project.dependencies);
  const detected = dependencies ? detectFramework(dependencies) : null;
  const detectedId = detected?.id;
  const attached = snapshot.runtimeCount > 0;
  const loading = useFirstLoad();
  useEffect(() => {
    if (fromLink) select(fromLink);
    else if (detectedId && frameworkId === null) select(detectedId);
  }, [fromLink, detectedId, frameworkId, select]);
  if (!setup && (completed || (attached && !fromLink))) {
    if (attached && !completed) complete();
    return <Navigate to="/timeline" replace />;
  }
  /* Shown before Studio names the app attached, the setup would flash on the way to the Timeline. */
  if (!setup && !fromLink && loading.runtimes) return null;
  const framework = FRAMEWORKS.find((f) => f.id === frameworkId) ?? null;
  const progress = framework ? setupProgress(framework, copied, attached, false) : null;
  const percent = progress ? (progress.done / progress.total) * 100 : 0;
  return (
    <div className="mx-auto max-w-310 px-9 pt-10 pb-16 max-sm:px-4 max-sm:pt-6">
      <div className="mb-7 flex flex-col gap-3">
        <div className="flex items-center gap-2.5 font-mono text-badge tracking-[0.1em] text-fg-subtle uppercase">
          <span className="text-brand">Setup</span>
          <span aria-hidden="true">·</span>
          <span>
            {progress ? `${progress.done} of ${progress.total} complete` : "pick your framework"}
          </span>
          <div className="h-0.5 w-30 overflow-hidden rounded-[2px] bg-raised">
            <div
              className="h-full bg-brand transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <h1 className="m-0 text-hero leading-[1.1] font-[560] tracking-[-0.035em] text-balance">
          Connect your app to Studio
        </h1>
        <p className="m-0 max-w-150 text-lead leading-[1.55] text-pretty text-fg-muted">
          Studio attaches to your dev server and records every Courier request — timing, payloads,
          headers and errors — as it happens. A few steps, and only config files change.
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start gap-7 max-[1180px]:grid-cols-[minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5.5">
          <FrameworkGrid
            selected={frameworkId}
            onSelect={select}
            attached={attachedApps(snapshot)[0]?.id}
            detected={detected?.label}
          />
          {framework ? (
            <StepsCard framework={framework} />
          ) : (
            <p className="rounded-dialog border border-dashed border-line-strong px-5 py-8 text-center text-fg-muted">
              Pick your framework above, and its steps appear here.
            </p>
          )}
        </div>
        <LiveCapture />
      </div>
    </div>
  );
}
