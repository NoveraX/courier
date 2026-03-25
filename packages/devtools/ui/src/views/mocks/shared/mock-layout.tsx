import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Activity, Database, Globe, LayoutDashboard, Network, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServerCount } from "@/store/mock-slice";
import { MockGeneratorWizard, useMockGenerator } from "../wizard";

import type { LucideIcon } from "lucide-react";

const TABS: Array<{ label: string; path: string; icon: LucideIcon }> = [
  { label: "Dashboard", path: "/mocks/dashboard", icon: LayoutDashboard },
  { label: "Routes", path: "/mocks/routes", icon: Globe },
  { label: "Store", path: "/mocks/store", icon: Database },
  { label: "Scenarios", path: "/mocks/scenarios", icon: Network },
  { label: "Network", path: "/mocks/network", icon: Zap },
  { label: "Logs", path: "/mocks/logs", icon: Activity },
];

export function MockLayout(): React.ReactElement {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const serverCount = useServerCount();
  const wizard = useMockGenerator();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {serverCount > 0 && (
        <div className="shrink-0 border-b border-border-subtle">
          <nav className="flex items-center gap-1 px-3 h-9">
            {TABS.map((tab) => {
              const active = pathname.startsWith(tab.path);
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={cn(
                    "relative flex items-center gap-1.5 px-2.5 py-1 text-xs transition-all duration-200",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground/90",
                  )}
                >
                  <tab.icon className={cn("size-3 shrink-0", active && "text-primary")} />
                  <span className="after:invisible after:block after:h-0 after:overflow-hidden after:font-medium after:content-[attr(data-label)]" data-label={tab.label}>
                    {tab.label}
                  </span>
                  {active && (
                    <span className="absolute inset-x-1 -bottom-1.25 h-px bg-primary" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>

      <MockGeneratorWizard wizard={wizard} />
    </div>
  );
}
