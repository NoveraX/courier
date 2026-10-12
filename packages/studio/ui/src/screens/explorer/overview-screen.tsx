import { overviewFigures } from "@/features/explorer/overview-model";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useNow } from "@/hooks/use-tick";
import { useInspector } from "@/inspector/use-inspector";
import { useStudioStore } from "@/store";
import { configFileName } from "@/store/config-file-name";
import { ActivityFeed } from "./activity-feed";
import { ExplorerEmpty } from "./explorer-empty";
import { ExplorerSkeleton } from "./explorer-skeleton";
import { HealthMatrix } from "./health-matrix";
import { OverviewFigures } from "./overview-figures";
import { SourceCards } from "./source-cards";
import { TopEndpoints } from "./top-endpoints";
import { useExplorerModel } from "./use-explorer-model";
import { useExplorerSearch } from "./use-explorer-search";

/**
 * The Explorer's overview: six figures over the project's API surface, the
 * health of every group, the endpoints that rank highest, a card per source
 * and the newest calls as they come in — two cards a row where they fit,
 * one a row on a phone.
 *
 * @returns The Overview tab
 * @example
 * ```tsx
 * <OverviewScreen />
 * ```
 */
export function OverviewScreen(): React.ReactNode {
  const model = useExplorerModel();
  const loading = useFirstLoad();
  const { set } = useExplorerSearch();
  const { open } = useInspector();
  const requests = useStudioStore((s) => s.requests);
  const configFile = useStudioStore((s) => configFileName(s.configStatus));
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const live = useStudioStore(
    (s) => s.connected && s.bindingSnapshot.runtimeCount > 0 && !s.paused && !s.shownSession,
  );
  const now = useNow();
  if (!model.endpoints.length) {
    return loading.sources ? <ExplorerSkeleton view="overview" /> : <ExplorerEmpty />;
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-360 flex-col gap-3.5 px-6 pt-5 pb-10 max-sm:px-4">
        <OverviewFigures figures={overviewFigures(model, requests, configFile)} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-3.5">
          <HealthMatrix
            model={model}
            onGroup={(key) => set({ q: `${key}.` }, "/explorer/endpoints")}
          />
          <TopEndpoints model={model} slowMs={slowMs} onOpen={(key) => set({ endpoint: key })} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-3.5">
          <SourceCards model={model} />
          <ActivityFeed requests={requests} now={now} slowMs={slowMs} live={live} onOpen={open} />
        </div>
      </div>
    </div>
  );
}
