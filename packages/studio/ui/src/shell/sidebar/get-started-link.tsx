import { Link, useRouterState } from "@tanstack/react-router";
import { Check, Rocket } from "lucide-react";

import { FRAMEWORKS } from "@/features/welcome/frameworks";
import { setupProgress } from "@/features/welcome/setup-progress";
import { useSetupStore } from "@/features/welcome/setup-store";
import { isWelcomeCompleted } from "@/features/welcome/welcome-storage";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";

const ROW =
  "flex h-8 items-center gap-2.5 rounded-control px-2.5 transition-colors hover:bg-raised hover:text-fg";

/**
 * The sidebar's way to the setup. While a setup is under way it is a card
 * with a segment per step; once an app is attached or the setup was
 * finished it says "Done"; before a framework is picked it is a plain link.
 *
 * @returns The link
 * @example
 * ```tsx
 * <GetStartedLink />
 * ```
 */
export function GetStartedLink(): React.ReactNode {
  const active = useRouterState({ select: (s) => s.location.pathname === "/next" });
  const attached = useStudioStore((s) => s.bindingSnapshot.runtimeCount > 0);
  const frameworkId = useSetupStore((s) => s.frameworkId);
  const copied = useSetupStore((s) => s.copied);
  const framework = FRAMEWORKS.find((f) => f.id === frameworkId);
  const done = attached || isWelcomeCompleted();
  if (framework && !done) {
    const progress = setupProgress(framework, copied, attached, false);
    return (
      <Link
        to="/next"
        search={{ setup: true }}
        aria-current={active ? "page" : undefined}
        className="flex flex-col gap-1.5 rounded-card bg-brand-dim px-2.5 pt-2.5 pb-2.75 text-fg"
      >
        <span className="flex items-center gap-2.5">
          <Rocket aria-hidden="true" className="size-3.75 shrink-0 text-brand" />
          <span className="font-strong">Get started</span>
          <span className="flex-1" />
          <span className="shrink-0 text-label whitespace-nowrap text-fg-muted tabular-nums">
            {progress.done} of {progress.total}
          </span>
        </span>
        <span aria-hidden="true" className="grid auto-cols-fr grid-flow-col gap-0.75 pl-6.25">
          {progress.steps.map((step) => (
            <span
              key={step.step.id}
              className={cn(
                "h-0.75 rounded-[2px] transition-colors duration-300",
                step.done ? "bg-brand" : "bg-line-strong",
              )}
            />
          ))}
        </span>
      </Link>
    );
  }
  return (
    <Link
      to="/next"
      search={{ setup: true }}
      aria-current={active ? "page" : undefined}
      className={cn(ROW, active ? "bg-raised font-strong text-fg" : "text-fg-muted")}
    >
      <Rocket
        aria-hidden="true"
        className={cn("size-3.75 shrink-0 opacity-85", active && "text-brand")}
      />
      <span>Get started</span>
      <span className="flex-1" />
      {done && (
        <span className="flex items-center gap-1 text-badge text-ok">
          <Check aria-hidden="true" className="size-3" />
          Done
        </span>
      )}
    </Link>
  );
}
