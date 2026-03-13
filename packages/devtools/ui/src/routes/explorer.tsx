import { useMemo, useCallback } from "react";
import {
  createFileRoute,
  Outlet,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import {
  Network,
  ArrowLeftRight,
  ArrowDownUp,
  Info,
  X,
  Eye,
  EyeOff,
} from "lucide-react";

import { useDevToolsStore } from "../store";
import { mergeSourceMaps, getDemoSourceMap } from "../views/explorer/helpers";
import { EndpointSidebar } from "../views/explorer/endpoint-sidebar";
import { ExplorerProvider } from "../views/explorer/explorer-context";

const VIEW_TABS = [
  { to: "/explorer/graph" as const, label: "Graph" },
  { to: "/explorer/pipeline" as const, label: "Pipeline" },
  { to: "/explorer/list" as const, label: "List" },
];

function ExplorerLayout() {
  const {
    sessions,
    explorerSelectedEndpoint,
    setExplorerSelectedEndpoint,
    graphLayout,
    setGraphLayout,
    showSchemas,
    setShowSchemas,
  } = useDevToolsStore();

  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });
  const isGraph = currentPath.endsWith("/graph");

  const { sourceMap, isDemo } = useMemo(() => {
    const merged = mergeSourceMaps(sessions);
    const empty = Object.keys(merged).length === 0;
    return {
      sourceMap: empty ? getDemoSourceMap() : merged,
      isDemo: empty,
    };
  }, [sessions]);

  const handleSelectEndpoint = useCallback(
    (ep: { source: string; group: string; method: string }) => {
      setExplorerSelectedEndpoint(ep);
    },
    [setExplorerSelectedEndpoint],
  );

  return (
    <ExplorerProvider sourceMap={sourceMap} onSelectEndpoint={handleSelectEndpoint}>
      <div className="flex h-full flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border-default bg-surface-0 px-3 py-1.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Network size={14} className="text-text-muted" />
              <span className="text-xs font-medium text-text-primary">API Explorer</span>
            </div>

            <div className="flex items-center gap-0.5 rounded-md bg-surface-1 p-0.5">
              {VIEW_TABS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="rounded px-2 py-0.5 text-[11px] text-text-muted transition-colors hover:text-text-secondary"
                  activeProps={{ className: "!bg-surface-2 !text-text-primary" }}
                >
                  {label}
                </Link>
              ))}
            </div>

            {isDemo && (
              <div className="flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5">
                <Info size={10} className="text-amber-400" />
                <span className="text-[10px] text-amber-400">Demo data — connect an app to see your API</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isGraph && (
              <>
                <button
                  type="button"
                  onClick={() => setShowSchemas(!showSchemas)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-colors ${
                    showSchemas
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-surface-1 text-text-muted hover:text-text-secondary"
                  }`}
                  title={showSchemas ? "Hide schema indicators" : "Show schema indicators"}
                >
                  {showSchemas ? <Eye size={12} /> : <EyeOff size={12} />}
                  Schemas
                </button>

                <button
                  type="button"
                  onClick={() => setGraphLayout(graphLayout === "LR" ? "TB" : "LR")}
                  className="flex items-center gap-1 rounded bg-surface-1 px-2 py-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
                  title={`Layout: ${graphLayout === "LR" ? "Left to Right" : "Top to Bottom"}`}
                >
                  {graphLayout === "LR" ? <ArrowLeftRight size={12} /> : <ArrowDownUp size={12} />}
                  {graphLayout}
                </button>
              </>
            )}

            {explorerSelectedEndpoint && (
              <div className="flex items-center gap-1.5 rounded bg-surface-1 px-2 py-1">
                <span className="text-[10px] font-mono text-indigo-400">
                  {explorerSelectedEndpoint.group
                    ? `${explorerSelectedEndpoint.source}.${explorerSelectedEndpoint.group}.${explorerSelectedEndpoint.method}`
                    : `${explorerSelectedEndpoint.source}.${explorerSelectedEndpoint.method}`}
                </span>
                <button
                  type="button"
                  onClick={() => setExplorerSelectedEndpoint(null)}
                  className="text-text-muted hover:text-text-secondary"
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>

          {explorerSelectedEndpoint && (
            <EndpointSidebar
              sourceMap={sourceMap}
              selected={explorerSelectedEndpoint}
              onClose={() => setExplorerSelectedEndpoint(null)}
            />
          )}
        </div>
      </div>
    </ExplorerProvider>
  );
}

export const Route = createFileRoute("/explorer")({
  component: ExplorerLayout,
});
