import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Database,
  Globe,
  LayoutDashboard,
  Network,
  Zap,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAllServers, useMockStore, useServerCount } from "@/store/mock-slice";

import type { LucideIcon } from "lucide-react";

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS: Array<{ label: string; path: string; icon: LucideIcon }> = [
  { label: "Dashboard", path: "/mocks/dashboard", icon: LayoutDashboard },
  { label: "Routes", path: "/mocks/routes", icon: Globe },
  { label: "Store", path: "/mocks/store", icon: Database },
  { label: "Scenarios", path: "/mocks/scenarios", icon: Network },
  { label: "Network", path: "/mocks/network", icon: Zap },
  { label: "Logs", path: "/mocks/logs", icon: Activity },
];

// ── Layout ────────────────────────────────────────────────────────────────────

export function MockLayout(): React.ReactElement {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const serverCount = useServerCount();
  const servers = useAllServers();
  const activeServerId = useMockStore((s) => s.activeServerId);
  const selectServer = useMockStore((s) => s.selectServer);
  const activeServer = servers.find((s) => s.serverId === activeServerId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Combined toolbar: server + tabs */}
      <div className="shrink-0 border-b border-border-subtle">
        <div className="flex h-11 items-center gap-3 px-3">
          {/* Server selector */}
          {serverCount > 0 && (
            <>
              {servers.length > 1 ? (
                <Select value={activeServerId ?? ""} onValueChange={selectServer}>
                  <SelectTrigger size="sm" className="h-7 w-44 gap-1.5 border-none bg-muted/40 text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((s) => (
                      <SelectItem key={s.serverId} value={s.serverId} className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <StatusDot connected={s.status === "connected"} />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : activeServer ? (
                <div className="flex h-7 items-center gap-1.5 rounded-md bg-muted/40 px-2.5 text-xs font-medium">
                  <StatusDot connected={activeServer.status === "connected"} />
                  <span>{activeServer.name}</span>
                </div>
              ) : null}

              {/* Separator */}
              <div className="h-4 w-px bg-border-subtle" />
            </>
          )}

          {/* Tabs inline */}
          <nav className="flex items-center gap-0.5">
            {TABS.map((tab) => {
              const active = pathname.startsWith(tab.path);
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={cn(
                    "relative flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                    active
                      ? "bg-muted/60 font-medium text-foreground"
                      : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30",
                  )}
                >
                  <tab.icon className="size-3" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

// ── Status Dot ────────────────────────────────────────────────────────────────

function StatusDot({ connected }: { connected?: boolean }): React.ReactElement {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        connected
          ? "bg-emerald-400 shadow-[0_0_4px_--theme(--color-emerald-400/0.6)]"
          : "bg-zinc-500",
      )}
    />
  );
}
