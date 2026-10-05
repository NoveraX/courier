import type { MockWizardState } from "@/features/mocks/wizard/types";
import { ApplyOutcome } from "./apply-outcome";
import { ManualPlan, ReadyPlan } from "./review-plans";

function Planning(): React.ReactNode {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <p className="text-control text-fg-subtle">
        Studio is planning the change to courier.mocks.ts…
      </p>
      <div className="flex flex-col gap-2 rounded-[11px] border border-line p-3">
        <div className="h-3.5 w-3/4 animate-pulse rounded-chip bg-raised" />
        <div className="h-3.5 w-1/2 animate-pulse rounded-chip bg-raised" />
        <div className="h-3.5 w-5/6 animate-pulse rounded-chip bg-raised" />
      </div>
    </div>
  );
}

/**
 * The Review step: Studio's plan as it arrives — ready, to add by hand, or
 * failed — or what came of applying it.
 *
 * @param props - The wizard
 * @returns The step
 * @example
 * ```tsx
 * <ReviewStep state={state} />
 * ```
 */
export function ReviewStep({ state }: { state: MockWizardState }): React.ReactNode {
  const { plan, apply } = state;
  if (
    apply.status === "failed" ||
    apply.status === "rolledBack" ||
    apply.status === "notVerified" ||
    apply.status === "rollbackFailed"
  ) {
    return (
      <ApplyOutcome
        outcome={apply}
        target={plan.status === "ready" ? plan.outcome.target : "courier.mocks.ts"}
      />
    );
  }
  switch (plan.status) {
    case "ready":
      return (
        <ReadyPlan
          outcome={plan.outcome}
          mockCount={plan.mocks.length}
          changedOnDisk={plan.changedOnDisk}
        />
      );
    case "manual":
      return <ManualPlan outcome={plan.outcome} />;
    case "failed":
      return (
        <p role="alert" className="rounded-panel bg-err-dim px-3 py-2.5 text-control text-err">
          Studio could not plan the change: {plan.message}
        </p>
      );
    case "loading":
      return <Planning />;
    case "idle":
      return null;
  }
}
