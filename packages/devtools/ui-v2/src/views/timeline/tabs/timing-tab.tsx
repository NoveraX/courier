import type { RequestEntry } from "@/store/types";
import { BreakdownCard, buildProxySegments, buildRequestSegments, computeProxyTotal } from "@/components/shared/timing-breakdown";
import { MiddlewareTiming } from "./middleware-timing";
import { FlowDiagram } from "./proxy-tab";

interface TimingTabProps {
  request: RequestEntry;
}

export function TimingTab({ request }: TimingTabProps): React.ReactElement {
  if (!request.timing) {
    return (
      <p className="py-8 text-center text-body-sm text-muted-foreground">
        No timing data available
      </p>
    );
  }

  return (
    <div className="space-y-5 p-4">
      <BreakdownCard
        title="Request Timing"
        segments={buildRequestSegments(request.timing)}
        total={request.timing.total}
      />
      {request.proxyTiming && (
        <>
          <FlowDiagram timing={request.proxyTiming} />
          <BreakdownCard
            title="Proxy Timing"
            segments={buildProxySegments(request.proxyTiming)}
            total={computeProxyTotal(request.proxyTiming)}
          />
        </>
      )}
      {request.middlewareEntries.length > 0 && (
        <MiddlewareTiming entries={request.middlewareEntries} />
      )}
    </div>
  );
}
