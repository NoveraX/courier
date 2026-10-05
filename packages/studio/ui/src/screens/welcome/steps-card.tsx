import { useNavigate } from "@tanstack/react-router";

import type { FrameworkConfig } from "@/features/welcome/frameworks-types";
import type { StepProgress } from "@/features/welcome/setup-progress";
import { setupProgress } from "@/features/welcome/setup-progress";
import { useSetupStore } from "@/features/welcome/setup-store";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { ConnectState } from "./connect-step";
import { InstallStep } from "./install-step";
import { SnippetStep } from "./snippet-step";
import { StepNode } from "./step-node";

function StepBody({
  progress,
  attached,
}: {
  progress: StepProgress;
  attached: boolean;
}): React.ReactNode {
  const markCopied = useSetupStore((s) => s.markCopied);
  const navigate = useNavigate();
  const copied = () => markCopied(progress.step.id);
  switch (progress.kind) {
    case "install":
      return <InstallStep npmCommands={progress.step.code ?? ""} onCopied={copied} />;
    case "client":
    case "server":
      return <SnippetStep step={progress.step} side={progress.kind} onCopied={copied} />;
    case "connect":
      return <ConnectState />;
    case "explore":
      return (
        <button
          type="button"
          disabled={!attached}
          onClick={() => {
            useSetupStore.getState().complete();
            void navigate({ to: "/timeline" });
          }}
          className="flex h-8.5 w-max items-center gap-2 rounded-card border border-brand bg-brand px-3.5 font-semibold text-bg transition-all enabled:cursor-pointer disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-fg-subtle"
        >
          {progress.step.actionLabel} <span aria-hidden="true">→</span>
        </button>
      );
  }
}

/**
 * A framework's setup, step by step: each with its marker, what it asks,
 * and the command, snippet or state that goes with it.
 *
 * @param props - The framework picked
 * @returns The card
 * @example
 * ```tsx
 * <StepsCard framework={framework} />
 * ```
 */
export function StepsCard({ framework }: { framework: FrameworkConfig }): React.ReactNode {
  const copied = useSetupStore((s) => s.copied);
  const attached = useStudioStore((s) => s.bindingSnapshot.runtimeCount > 0);
  const unreachable = useStudioStore(
    (s) => s.connectionStatus === "disconnected" || s.connectionStatus === "reconnecting",
  );
  const { steps } = setupProgress(framework, copied, attached, unreachable);
  return (
    <ol className="overflow-hidden rounded-dialog border border-line bg-panel">
      {steps.map((progress) => (
        <li
          key={progress.step.id}
          className={cn(
            "grid grid-cols-[28px_minmax(0,1fr)] gap-4 border-b border-line px-5 pt-5 pb-5.5 transition-colors duration-300 last:border-b-0",
            progress.kind === "connect" && progress.current && !progress.failed && "bg-brand-tint",
          )}
        >
          <div className="flex flex-col items-center">
            <StepNode
              number={progress.number}
              done={progress.done}
              current={progress.current}
              failed={progress.failed}
              waiting={progress.kind === "connect" && progress.current && !progress.failed}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-0.75">
              <span className="flex items-center gap-2 text-title font-semibold">
                {progress.step.title}
                {progress.kind === "server" && (
                  <span className="rounded-chip border border-warn/35 px-1.25 py-px font-mono text-micro font-medium tracking-caps text-warn">
                    SSR
                  </span>
                )}
              </span>
              <span className="text-ui text-pretty text-fg-muted">{progress.step.description}</span>
            </div>
            <StepBody progress={progress} attached={attached} />
          </div>
        </li>
      ))}
    </ol>
  );
}
