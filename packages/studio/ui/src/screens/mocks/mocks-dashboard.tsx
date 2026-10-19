import type { LucideIcon } from "lucide-react";
import { Activity, CircleAlert, Flame, GitFork, Route, Timer } from "lucide-react";

import { FigureGrid } from "@/design/figure-grid";
import type { MockFigure } from "@/features/mocks/dashboard-model";
import { mockFigures } from "@/features/mocks/dashboard-model";
import { logsOf } from "@/features/mocks/mock-log";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useNow } from "@/hooks/use-tick";
import { useMockInspector } from "@/inspector/use-mock-inspector";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import { CollectionCards } from "./collection-cards";
import { LiveActivity } from "./live-activity";
import { MocksSkeleton } from "./mocks-skeleton";
import { NoMockServers } from "./no-mock-servers";
import { TopRoutes } from "./top-routes";
import { useMockServer } from "./use-mock-server";

const ICONS: Readonly<Record<MockFigure["key"], LucideIcon>> = {
  routes: Route,
  throughput: Activity,
  errors: CircleAlert,
  latency: Timer,
  scenario: GitFork,
  chaos: Flame,
};

/**
 * The Mocks dashboard: the server's six figures, its newest answers, its
 * busiest routes and its collections — or the way to generate a first
 * mock when there is none.
 *
 * @returns The Dashboard tab
 * @example
 * ```tsx
 * <MocksDashboard />
 * ```
 */
export function MocksDashboard(): React.ReactNode {
  const { server } = useMockServer();
  const allLogs = useMockStore((s) => s.logs);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const now = useNow();
  const sheet = useMockInspector();
  const first = useFirstLoad();
  const loading = first.requests || first.sources;
  if (!server) return loading ? <MocksSkeleton view="dashboard" /> : <NoMockServers />;
  const logs = logsOf(allLogs, server.serverId);
  const figures = mockFigures(server, logs, now, slowMs).map((figure) => ({
    ...figure,
    icon: ICONS[figure.key],
  }));
  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-3.5 px-6 pt-5 pb-10 max-sm:px-4 max-sm:pt-4">
      <FigureGrid label="Mock figures" figures={figures} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-3.5">
        <LiveActivity
          logs={logs}
          running={server.processStatus === "running"}
          now={now}
          slowMs={slowMs}
          onOpen={sheet.open}
        />
        <div className="flex flex-col gap-3.5">
          <TopRoutes routes={server.routes} />
          <CollectionCards collections={server.collections} />
        </div>
      </div>
    </div>
  );
}
