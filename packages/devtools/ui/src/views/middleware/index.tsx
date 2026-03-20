import { useCallback } from "react";
import { Workflow } from "lucide-react";

import { PageShell } from "@/components/shared/page-shell";
import { EmptyState } from "@/components/shared/empty-state";

import { useMiddleware } from "./use-middleware";
import { Toolbar } from "./toolbar";
import { AggregateCards } from "./aggregate-cards";
import { OverheadGauge } from "./overhead-gauge";
import { MiddlewareBars } from "./middleware-bars";
import { MiddlewareProfiles } from "./middleware-profiles";
import { MiddlewareTable } from "./middleware-table";
import { EndpointImpactPanel } from "./endpoint-impact";
import { ChainView } from "./chain-view";

/** Threshold: use profile cards for ≤ this many, table for more */
const PROFILE_CARDS_MAX = 6;

// ── View ───────────────────────────────────────────────────────────────────

export function MiddlewareView(): React.ReactElement {
  const mw = useMiddleware();

  if (mw.totalRequests === 0) {
    return (
      <PageShell center>
        <EmptyState icon={Workflow} heading="No requests yet" description="Make some API calls to see middleware statistics." />
      </PageShell>
    );
  }

  if (mw.requests.length === 0) {
    return (
      <PageShell center>
        <EmptyState icon={Workflow} heading="No middleware detected" description="None of the captured requests used middleware." />
      </PageShell>
    );
  }

  return <MiddlewareContent mw={mw} />;
}

// ── Content ────────────────────────────────────────────────────────────────

function MiddlewareContent({
  mw,
}: {
  mw: ReturnType<typeof useMiddleware>;
}): React.ReactElement {
  const handleProfileSelect = useCallback(
    (name: string) => {
      const req = mw.requests.find((r) =>
        r.middlewareEntries.some((e) => e.name === name),
      );
      if (req) {
        mw.setMode("chain");
        mw.setSelectedRequest(req.id);
      }
    },
    [mw],
  );

  const handleEndpointSelect = useCallback(
    (requestId: string) => {
      mw.setMode("chain");
      mw.setSelectedRequest(requestId);
    },
    [mw],
  );

  const handleBack = useCallback(() => mw.setMode("aggregate"), [mw]);

  const toolbar = (
    <Toolbar
      mode={mw.mode}
      middlewareCount={mw.aggregateStats.length}
      requestCount={mw.requests.length}
      onModeChange={mw.setMode}
    />
  );

  return (
    <PageShell toolbar={toolbar}>
      <div className="space-y-5 p-5">
        {mw.mode === "aggregate" ? (
          <AggregateContent mw={mw} onProfileSelect={handleProfileSelect} onEndpointSelect={handleEndpointSelect} />
        ) : (
          <ChainView
            requests={mw.requests}
            selectedId={mw.selectedRequestId}
            selectedRequest={mw.selectedRequest}
            chain={mw.selectedChain}
            aggregateStats={mw.aggregateStats}
            onSelectRequest={mw.setSelectedRequest}
            onBack={handleBack}
          />
        )}
      </div>
    </PageShell>
  );
}

// ── Aggregate content ──────────────────────────────────────────────────────

function AggregateContent({
  mw,
  onProfileSelect,
  onEndpointSelect,
}: {
  mw: ReturnType<typeof useMiddleware>;
  onProfileSelect: (name: string) => void;
  onEndpointSelect: (requestId: string) => void;
}): React.ReactElement {
  return (
    <>
      <AggregateCards
        stats={mw.aggregateStats}
        overheadPercent={mw.overheadStats.avgOverheadPercent}
        execSparkline={mw.execSparkline}
        overheadSparkline={mw.overheadSparkline}
        p95Sparkline={mw.p95Sparkline}
      />

      {/* Hero: gauge + bars side by side */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[auto_1fr]">
        <div className="flex items-center justify-center rounded-xl border border-border-subtle bg-card px-8 py-6">
          <OverheadGauge percent={mw.overheadStats.avgOverheadPercent} />
        </div>
        <div className="rounded-xl border border-border-subtle bg-card p-4">
          <MiddlewareBars stats={mw.aggregateStats} />
        </div>
      </div>

      {/* Middleware detail: cards for few, table for many */}
      {mw.aggregateStats.length <= PROFILE_CARDS_MAX ? (
        <MiddlewareProfiles stats={mw.aggregateStats} onSelect={onProfileSelect} />
      ) : (
        <MiddlewareTable stats={mw.aggregateStats} onRowClick={onProfileSelect} />
      )}

      {/* Endpoint impact */}
      <EndpointImpactPanel endpoints={mw.endpointImpact} onSelect={onEndpointSelect} />
    </>
  );
}
