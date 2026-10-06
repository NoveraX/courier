import type { LucideIcon } from "lucide-react";
import { FlaskConical, Inbox, ShieldAlert, Timer, Workflow } from "lucide-react";
import { useState } from "react";

import type { ScenarioKind } from "@/features/mocks/scenario-view";
import { scenarioKindOf } from "@/features/mocks/scenario-view";
import { cn } from "@/lib/utils";
import { sendMockCommand } from "@/mocks/send-mock-command";
import type { MockScenarioEntry } from "@/store/mock-slice";

const KIND_LOOK: Readonly<Record<ScenarioKind, { icon: LucideIcon; className: string }>> = {
  state: { icon: Workflow, className: "bg-brand-dim text-brand" },
  failure: { icon: ShieldAlert, className: "bg-err-dim text-err" },
  slow: { icon: Timer, className: "bg-warn-dim text-warn" },
  empty: { icon: Inbox, className: "bg-raised text-fg-muted" },
  custom: { icon: FlaskConical, className: "bg-syntax-keyword/12 text-syntax-keyword" },
};

interface ScenarioCardProps {
  scenario: MockScenarioEntry;
  serverId: string;
  selected: boolean;
  /** Whether the mock runs, and so can turn a scenario on. */
  running: boolean;
  onOpen: () => void;
}

/**
 * A scenario as a card: what it is for, ACTIVE while it is on, and the way
 * to turn it on — which waits for the mock and says why when the mock
 * could not, the scenario on staying as it was.
 *
 * @param props - The scenario, its mock, whether it is open, whether the mock runs, and what opens it
 * @returns The card
 * @example
 * ```tsx
 * <ScenarioCard scenario={scenario} serverId="shop" selected running onOpen={open} />
 * ```
 */
export function ScenarioCard({
  scenario,
  serverId,
  selected,
  running,
  onOpen,
}: ScenarioCardProps): React.ReactNode {
  const [turning, setTurning] = useState<{ pending: boolean; error?: string | undefined }>({
    pending: false,
  });
  const look = KIND_LOOK[scenarioKindOf(scenario)];
  const activate = async (): Promise<void> => {
    setTurning({ pending: true });
    const reply = await sendMockCommand({
      action: "mock:scenario:apply",
      serverId,
      scenario: scenario.name,
    });
    setTurning({ pending: false, error: reply.ok ? undefined : reply.error });
  };
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-dialog border px-3.5 py-3",
        selected
          ? "border-brand/60 bg-brand-tint"
          : "border-line bg-panel hover:border-line-strong",
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-pressed={selected}
          onClick={onOpen}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
          <span
            className={cn(
              "flex size-8.5 shrink-0 items-center justify-center rounded-panel",
              look.className,
            )}
          >
            <look.icon aria-hidden="true" className="size-3.75" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.75">
            <span className="flex items-center gap-2">
              <span className="text-ui font-semibold">{scenario.name}</span>
              {scenario.isActive && (
                <span className="flex h-4.5 items-center gap-1.25 rounded-full bg-ok-dim px-1.75 text-micro font-bold tracking-[0.04em] text-ok">
                  ACTIVE
                </span>
              )}
            </span>
            <span className="truncate text-small text-fg-subtle">
              {scenario.description ??
                `Overrides ${scenario.endpointCount} ${scenario.endpointCount === 1 ? "route" : "routes"}`}
            </span>
          </span>
        </button>
        <button
          type="button"
          disabled={scenario.isActive || !running || turning.pending}
          onClick={() => void activate()}
          className={cn(
            "h-7 shrink-0 cursor-pointer rounded-control border px-2.75 text-small font-semibold disabled:cursor-default",
            scenario.isActive
              ? "border-ok/40 bg-ok-dim text-ok"
              : "border-line-strong bg-panel text-fg hover:bg-raised disabled:opacity-50",
          )}
        >
          {scenario.isActive ? "Active" : turning.pending ? "Turning on…" : "Activate"}
        </button>
      </div>
      {turning.error && !scenario.isActive && (
        <p role="alert" className="rounded-control bg-err-dim px-2.5 py-1.5 text-small text-err">
          Could not turn it on — {turning.error}
        </p>
      )}
    </div>
  );
}
