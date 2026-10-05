import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CircleAlert,
  Flame,
  GitFork,
  Route,
  Server,
  Sparkles,
  Timer,
} from "lucide-react";

import { FigureGrid } from "@/design/figure-grid";
import type { MockFigure } from "@/features/mocks/dashboard-model";
import { mockFigures } from "@/features/mocks/dashboard-model";
import { logsOf } from "@/features/mocks/mock-log";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useNow } from "@/hooks/use-tick";
import { useMockInspector } from "@/inspector/use-mock-inspector";
import { openMockWizard } from "@/mocks/wizard/open-mock-wizard";
import { useAddMockBlocked } from "@/mocks/wizard/use-add-mock-blocked";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import { CollectionCards } from "./collection-cards";
import { LiveActivity } from "./live-activity";
import { MocksSkeleton } from "./mocks-skeleton";
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

function NoServers(): React.ReactNode {
  const blocked = useAddMockBlocked();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-dialog border border-line-strong bg-panel text-fg-subtle">
        <Server aria-hidden="true" className="size-4.5" />
      </span>
      <p className="text-title font-semibold">No mock servers yet</p>
      <p className="max-w-95 text-small text-fg-subtle">
        {blocked ??
          "Generate mocks for one of your API sources, and Studio serves realistic answers from its schemas."}
      </p>
      <button
        type="button"
        onClick={openMockWizard}
        disabled={blocked !== null}
        className="mt-2 flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-fg px-3 text-control font-semibold text-bg disabled:cursor-default disabled:opacity-50"
      >
        <Sparkles aria-hidden="true" className="size-3.25" />
        Generate mocks
      </button>
    </div>
  );
}

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
  if (!server) return loading ? <MocksSkeleton view="dashboard" /> : <NoServers />;
  const logs = logsOf(allLogs, server.serverId);
  const figures = mockFigures(server, logs, now, slowMs).map((figure) => ({
    ...figure,
    icon: ICONS[figure.key],
  }));
  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-3.5 px-6 pt-5 pb-10">
      <FigureGrid label="Mock figures" figures={figures} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-3.5">
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
