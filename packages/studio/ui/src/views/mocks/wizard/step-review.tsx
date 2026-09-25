import type { MockWizardState } from "./types";

import { ReviewManual } from "./review-manual";
import { ReviewOutcome } from "./review-outcome";
import { ReviewReady } from "./review-ready";

function Planning(): React.ReactElement {
  return (
    <div className="space-y-3" aria-busy>
      <p className="text-body-sm text-muted-foreground">Studio is planning the change to courier.mocks.ts…</p>
      <div className="space-y-2 rounded-lg border border-border-subtle p-3">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted/70" />
        <div className="h-3.5 w-5/6 animate-pulse rounded bg-muted/50" />
      </div>
    </div>
  );
}

/**
 * The Review step: Studio's plan while it is made, the change to confirm,
 * the mocks to add by hand, a request that failed, or what came of an apply
 * that did not add the mocks.
 *
 * @param props.state - The wizard on its Review step
 * @returns The step
 *
 * @example
 * ```tsx
 * <ReviewStep state={state} />
 * ```
 */
export function ReviewStep({ state }: { state: MockWizardState }): React.ReactElement | null {
  const { plan, apply } = state;
  if (apply.status === "failed" || apply.status === "rolledBack" || apply.status === "notVerified" || apply.status === "rollbackFailed") {
    const target = plan.status === "ready" ? plan.outcome.target : "courier.mocks.ts";
    return <ReviewOutcome outcome={apply} target={target} />;
  }
  switch (plan.status) {
    case "ready":
      return <ReviewReady outcome={plan.outcome} mockCount={plan.mocks.length} changedOnDisk={plan.changedOnDisk} />;
    case "manual":
      return <ReviewManual outcome={plan.outcome} />;
    case "failed":
      return (
        <div role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-body-sm text-rose-400">
          Studio could not plan the change: {plan.message}
        </div>
      );
    case "loading":
      return <Planning />;
    case "idle":
      return null;
  }
}
