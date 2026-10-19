import { ArrowLeftRight, ArrowUpDown, GitCompare } from "lucide-react";

import { EmptyPanel } from "@/design/empty-panel";
import { compareSummary } from "@/features/compare/compare-summary";
import { useFirstLoad } from "@/hooks/use-first-load";
import { CompareBody } from "./compare-body";
import { CompareHeader } from "./compare-header";
import { CompareSkeleton } from "./compare-skeleton";
import { RequestSlot } from "./request-slot";
import { SummaryStrip } from "./summary-strip";
import { useCompareModel } from "./use-compare-model";

function NotEnough(): React.ReactNode {
  return (
    <EmptyPanel icon={GitCompare} title="Compare needs two finished requests">
      Make a few calls from your app; Compare lines up any two of them — response, headers, timing
      and variables.
    </EmptyPanel>
  );
}

/**
 * The Compare page: two captured calls side by side — picked, swapped or
 * taken from a ready-made pair — what moved between them at a glance, and
 * their responses, headers, timing and variables diffed. A phone puts the
 * two calls one over the other, with the swap between them.
 *
 * @returns The page
 * @example
 * ```tsx
 * <CompareScreen />
 * ```
 */
export function CompareScreen(): React.ReactNode {
  const model = useCompareModel();
  const { pair } = model;
  const loading = useFirstLoad();
  return (
    <div className="mx-auto flex min-h-full w-full max-w-320 flex-col gap-4 px-6 pt-6 pb-12 max-sm:px-4 max-sm:pt-4">
      <CompareHeader preset={pair ? model.preset : undefined} onPreset={model.applyPreset} />
      {loading.requests ? (
        <CompareSkeleton />
      ) : !pair ? (
        <NotEnough />
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] items-stretch gap-2.5 max-sm:grid-cols-1 max-sm:gap-2">
            <RequestSlot
              side="a"
              request={pair[0]}
              candidates={model.candidates}
              onPick={(id) => model.pick("a", id)}
            />
            <button
              type="button"
              title="Swap A and B"
              aria-label="Swap A and B"
              onClick={model.swap}
              className="flex size-9 cursor-pointer items-center justify-center self-center rounded-full border border-line-strong bg-panel text-fg-muted hover:border-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-brand max-sm:justify-self-center"
            >
              <ArrowLeftRight aria-hidden="true" className="size-3.5 max-sm:hidden" />
              <ArrowUpDown aria-hidden="true" className="size-3.5 sm:hidden" />
            </button>
            <RequestSlot
              side="b"
              request={pair[1]}
              candidates={model.candidates}
              onPick={(id) => model.pick("b", id)}
            />
          </div>
          {model.missing && (
            <p role="status" className="m-0 text-small text-warn">
              A request the link named is no longer held — the latest pair is shown in its place.
            </p>
          )}
          <SummaryStrip cells={compareSummary(pair[0], pair[1])} />
          <CompareBody pair={pair} tab={model.tab} onTab={model.setTab} />
        </>
      )}
    </div>
  );
}
