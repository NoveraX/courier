import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Flame, GitBranch, LayoutDashboard, List } from "lucide-react";

import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { ColorMetric } from "@/features/explorer/metric-value";
import { cn } from "@/lib/utils";
import type { ExplorerTab } from "./use-explorer-search";
import { useExplorerSearch } from "./use-explorer-search";

const TABS: readonly { to: ExplorerTab; label: string; icon: LucideIcon }[] = [
  { to: "/explorer", label: "Graph", icon: GitBranch },
  { to: "/explorer/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/explorer/endpoints", label: "Endpoints", icon: List },
  { to: "/explorer/heatmap", label: "Heatmap", icon: Flame },
];

const METRICS: readonly SegmentedOption<ColorMetric>[] = [
  { value: "latency", label: "Latency" },
  { value: "errors", label: "Errors" },
  { value: "traffic", label: "Traffic" },
  { value: "size", label: "Size" },
];

/* The tabs that colour what they draw by a metric. */
const COLOURED = new Set<string>(["/explorer", "/explorer/heatmap"]);

/**
 * The Explorer's bar: its four tabs, each keeping the search and the open
 * endpoint, and — on the Graph and the Heatmap — what they colour by.
 *
 * @returns The bar
 * @example
 * ```tsx
 * <ExplorerBar />
 * ```
 */
export function ExplorerBar(): React.ReactNode {
  const pathname = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, "") });
  const { metric, set } = useExplorerSearch();
  return (
    <div className="flex min-h-12.5 shrink-0 flex-wrap items-center gap-2 border-b border-line py-2.5 pr-4 pl-5">
      <nav
        aria-label="Explorer views"
        className="flex gap-0.5 rounded-card border border-line bg-inset p-0.5"
      >
        {TABS.map(({ to, label, icon: Icon }) => {
          const on = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              search={true}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex h-6 items-center gap-1.5 rounded-[6px] px-2.5 text-small font-strong whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-brand",
                on ? "bg-raised text-fg" : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              <Icon aria-hidden="true" className={cn("size-3", on && "text-brand")} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      {COLOURED.has(pathname) && (
        <div className="flex items-center gap-2">
          <span className="text-label text-fg-subtle">Color by</span>
          <Segmented
            label="Color by"
            options={METRICS}
            value={metric}
            onChange={(next) => set({ metric: next })}
            quiet="subtle"
          />
        </div>
      )}
    </div>
  );
}
