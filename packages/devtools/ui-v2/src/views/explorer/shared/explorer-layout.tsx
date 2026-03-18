import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  GitBranch,
  LayoutDashboard,
  List,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

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
      <nav className="relative flex h-11 shrink-0 items-center gap-0.5 border-b border-border-subtle px-3">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.path);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={cn(
                "relative flex items-center gap-1 px-2 py-1 text-sm transition-colors",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground/70 hover:text-muted-foreground",
              )}
            >
              <tab.icon className="size-3" />
              {tab.label}
              {active && (
                <span className="absolute inset-x-0.5 -bottom-1.25 h-px bg-accent-brand" />
              )}
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
