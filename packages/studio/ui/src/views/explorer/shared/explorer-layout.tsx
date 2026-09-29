import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Flame, GitBranch, LayoutDashboard, List } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tab config ──────────────────────────────────────────────────────────────

interface ExplorerTab {
  label: string;
  path: string;
  icon: LucideIcon;
}

const TABS: ExplorerTab[] = [
  { label: "Graph", path: "/explorer/graph", icon: GitBranch },
  { label: "Overview", path: "/explorer/overview", icon: LayoutDashboard },
  { label: "Endpoints", path: "/explorer/endpoints", icon: List },
  { label: "Heatmap", path: "/explorer/heatmap", icon: Flame },
];

// ── Component ───────────────────────────────────────────────────────────────

export function ExplorerLayout(): React.ReactElement {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <nav className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle px-3">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.path);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={cn(
                "relative flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground/90",
              )}
            >
              <tab.icon className={cn("size-3 shrink-0", active && "text-primary")} />
              <span
                className="after:invisible after:block after:h-0 after:overflow-hidden after:font-medium after:content-[attr(data-label)]"
                data-label={tab.label}
              >
                {tab.label}
              </span>
              {active && <span className="absolute inset-x-1 -bottom-1.25 h-px bg-primary" />}
            </Link>
          );
        })}
      </nav>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
