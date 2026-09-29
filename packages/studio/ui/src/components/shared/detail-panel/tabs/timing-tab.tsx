import { StreamTimingSummary } from "@/components/shared/stream-timing-summary";
import {
  BreakdownCard,
  buildProxySegments,
  buildRequestSegments,
  computeProxyTotal,
} from "@/components/shared/timing-breakdown";
import type { RequestEntry } from "@/store/types";
import { MiddlewareTiming } from "./middleware-timing";
import { FlowDiagram } from "./proxy-tab";

interface TimingTabProps {
  request: RequestEntry;
}

export function TimingTab({ request }: TimingTabProps): React.ReactElement {
  const isStream = request.transport === "sse" || request.transport === "ws";

  if (request.timing) {
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

  if (isStream && request.streamStatus === "complete") {
    return (
      <div className="p-4">
        <StreamTimingSummary
          data={{
            duration: request.streamDuration,
            eventCount: request.streamEventCount,
            totalBytes: request.streamTotalBytes,
            transport: request.transport,
          }}
        />
      </div>
    );
  }

  return (
    <p className="py-8 text-center text-body-sm text-muted-foreground">
      {isStream && request.streamStatus === "streaming"
        ? "Timing available after stream closes"
        : "No timing data available"}
    </p>
  );
}
