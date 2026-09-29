import { LayoutDashboard } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import { useStudioStore } from "@/store";
import { EndpointPanel } from "../detail/endpoint-panel";
import { formatEndpointKey } from "../helpers";
import { useExplorerData } from "../use-explorer-data";
import { useExplorerNavigation } from "../use-explorer-navigation";
import { ActivityFeed } from "./activity-feed";
import { computeActivityFeed } from "./compute-activity";
import type { TopMetric } from "./compute-overview";
import { computeHealthMatrix, computeOverviewKPIs, computeTopEndpoints } from "./compute-overview";
import { HealthMatrix } from "./health-matrix";
import { KPIStrip } from "./kpi-strip";
import { SourceCard } from "./source-card";
import { TopEndpoints } from "./top-endpoints";

// ── Component ───────────────────────────────────────────────────────────────

export function OverviewDashboard(): React.ReactElement {
  const requests = useStudioStore((s) => s.requests);
  const { sources, groups, endpoints, isEmpty } = useExplorerData();
  const { navigateToTimeline, openPlayground } = useExplorerNavigation();
  const [topMetric, setTopMetric] = useState<TopMetric>("latency");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const kpis = useMemo(
    () => computeOverviewKPIs(sources, groups, endpoints, requests),
    [sources, groups, endpoints, requests],
  );

  const healthMatrix = useMemo(() => computeHealthMatrix(groups), [groups]);

  const topEndpoints = useMemo(
    () => computeTopEndpoints(endpoints, topMetric),
    [endpoints, topMetric],
  );

  const activityFeed = useMemo(() => computeActivityFeed(requests), [requests]);

  if (isEmpty) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={LayoutDashboard}
          heading="No API sources"
          description="Define API sources in your project to see the overview dashboard with health metrics and live activity."
        />
      </div>
    );
  }

  return (
    <>
      <PageShell>
        <div className="space-y-5 p-5">
          {/* KPI strip */}
          <KPIStrip kpis={kpis} />

          {/* Middle row: Health Matrix + Top Endpoints */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel title="Health Matrix">
              <HealthMatrix cells={healthMatrix} />
            </Panel>
            <Panel title="Top Endpoints">
              <TopEndpoints
                endpoints={topEndpoints}
                metric={topMetric}
                onMetricChange={setTopMetric}
                onSelectEndpoint={(s, g, m) => setSelectedKey(formatEndpointKey(s, g, m))}
              />
            </Panel>
          </div>

          {/* Bottom row: Sources + Activity Feed */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel title="Sources">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {sources.map((src) => (
                  <SourceCard key={src.name} source={src} />
                ))}
              </div>
            </Panel>
            <Panel title="Activity Feed">
              <ActivityFeed entries={activityFeed} onSelectEntry={navigateToTimeline} />
            </Panel>
          </div>
        </div>
      </PageShell>

      <EndpointPanel
        selectedKey={selectedKey}
        onClose={() => setSelectedKey(null)}
        onNavigateToTimeline={navigateToTimeline}
        onOpenPlayground={openPlayground}
      />
    </>
  );
}

// ── Panel wrapper ───────────────────────────────────────────────────────────

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4">
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h4>
      {children}
    </div>
  );
}
