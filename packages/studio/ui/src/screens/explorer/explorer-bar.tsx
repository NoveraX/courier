import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Flame, GitBranch, LayoutDashboard, List, Palette } from "lucide-react";
import { useEffect, useRef } from "react";

import { MEDIA } from "@/design/breakpoints";
import { ChoiceMenu } from "@/design/choice-menu";
import type { SegmentedOption } from "@/design/segmented";
import { SEGMENT_FRAME, SEGMENT_PILL, SEGMENT_TARGET, Segmented } from "@/design/segmented";
import type { ColorMetric } from "@/features/explorer/metric-value";
import { useMediaQuery } from "@/hooks/use-media-query";
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

/* Tabs that scroll sideways keep the one open in view. */
function reveal(nav: HTMLElement | null, tab: string): void {
  const link = nav?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
  if (!nav || !link) return;
  const bounds = nav.getBoundingClientRect();
  const box = link.getBoundingClientRect();
  if (box.left < bounds.left) nav.scrollLeft -= bounds.left - box.left;
  else if (box.right > bounds.right) nav.scrollLeft += box.right - bounds.right;
}

/* A phone has no room for the four metrics side by side: it picks one from a menu. */
function ColorBy({
  metric,
  phone,
  onChange,
}: {
  metric: ColorMetric;
  phone: boolean;
  onChange: (metric: ColorMetric) => void;
}): React.ReactNode {
  if (phone) {
    return (
      <ChoiceMenu
        icon={Palette}
        label="Color"
        choices={METRICS}
        value={metric}
        onChange={onChange}
      />
    );
  }
  return (
    <>
      <span className="text-label text-fg-subtle">Color by</span>
      <Segmented
        label="Color by"
        options={METRICS}
        value={metric}
        onChange={onChange}
        quiet="subtle"
      />
    </>
  );
}

/**
 * The Explorer's bar: its four tabs, each keeping the search and the open
 * endpoint, and — on the Graph and the Heatmap — what they colour by. On a
 * phone it stays one row: the metric is picked from a menu, beside which
 * the tabs not open show their icons alone, their names still read out;
 * tabs that still do not fit scroll sideways, the one open kept in view.
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
  const nav = useRef<HTMLElement>(null);
  const phone = useMediaQuery(MEDIA.phone);
  const coloured = COLOURED.has(pathname);
  useEffect(() => reveal(nav.current, pathname), [pathname]);
  return (
    <div className="flex min-h-12.5 shrink-0 flex-wrap items-center gap-2 border-b border-line py-2.5 pr-4 pl-5 max-sm:flex-nowrap pointer-coarse:py-1.5">
      <nav
        ref={nav}
        aria-label="Explorer views"
        className={cn("scroll-row min-w-0 gap-0.5", SEGMENT_FRAME)}
      >
        {TABS.map(({ to, label, icon: Icon }) => {
          const on = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              search={true}
              data-tab={to}
              aria-current={on ? "page" : undefined}
              className={SEGMENT_TARGET}
            >
              <span
                className={cn(
                  SEGMENT_PILL,
                  "max-sm:px-2",
                  on ? "bg-raised text-fg" : "text-fg-subtle group-hover/segment:text-fg-muted",
                )}
              >
                <Icon aria-hidden="true" className={cn("size-3", on && "text-brand")} />
                <span className={cn(phone && coloured && !on && "sr-only")}>{label}</span>
              </span>
            </Link>
          );
        })}
      </nav>
      {coloured && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ColorBy metric={metric} phone={phone} onChange={(next) => set({ metric: next })} />
        </div>
      )}
    </div>
  );
}
