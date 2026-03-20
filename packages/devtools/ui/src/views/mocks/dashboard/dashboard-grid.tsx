import type { MockServerInfo } from "@/store/mock-slice";
import { CollectionsPanel } from "./collections-panel";
import { KPIStrip } from "./kpi-strip";
import { LiveActivity } from "./live-activity";
import { StatusBar } from "./status-bar";

interface DashboardGridProps {
  server: MockServerInfo;
}

export function DashboardGrid({ server }: DashboardGridProps): React.ReactElement {
  return (
    <div className="space-y-3 p-4">
      {/* Inline status + scenario + actions */}
      <StatusBar server={server} />

      {/* KPI metrics */}
      <KPIStrip server={server} />

      {/* Collections + Live Activity */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CollectionsPanel collections={server.collections} />
        <LiveActivity />
      </div>
    </div>
  );
}
