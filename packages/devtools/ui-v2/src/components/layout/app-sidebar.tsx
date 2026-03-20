import { useMemo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { useDevToolsStore } from "@/store";
import { runAudit } from "@/views/audit/run-audit";
import { NAV_GROUPS } from "@/app-config";
import type { NavItem } from "@/app-config";
import { KbdHint } from "@/components/shared/kbd-hint";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from "@/components/ui/sidebar";
import { SidebarFooterSection } from "./sidebar-footer";

function NavBadge({ item }: { item: NavItem }): React.ReactNode {
  const requests = useDevToolsStore((s) => s.requests);
  if (!item.badge) return null;

  if (item.badge === "audit-score") return <AuditScoreBadge />;

  let count = 0;
  if (item.badge === "requests") count = requests.length;
  if (item.badge === "errors") count = requests.filter((r) => r.status === "error").length;
  if (item.badge === "sessions") count = useDevToolsStore.getState().sessions.length;

  if (count === 0) return null;

  const isError = item.badge === "errors";
  const label = count > 999 ? "999+" : count;

  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5",
        "text-[10px] font-semibold tabular-nums leading-none",
        "group-data-[collapsible=icon]:hidden",
        isError
          ? "bg-destructive/15 text-destructive ring-1 ring-destructive/25"
          : "bg-accent-brand/15 text-accent-brand ring-1 ring-accent-brand/25",
      )}
    >
      {label}
    </span>
  );
}

function AuditScoreBadge(): React.ReactNode {
  const requests = useDevToolsStore((s) => s.requests);
  const catalog = useDevToolsStore((s) => s.catalog);

  const score = useMemo(() => {
    if (requests.length === 0) return null;
    return runAudit(requests, catalog).score;
  }, [requests, catalog]);

  if (score === null) return null;

  const colorClass =
    score >= 90
      ? "bg-success-muted text-success-foreground ring-1 ring-success/25"
      : score >= 70
        ? "bg-warning-muted text-warning-foreground ring-1 ring-warning/25"
        : "bg-destructive/15 text-destructive ring-1 ring-destructive/25";

  return (
    <span
      className={cn(
        "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1.5",
        "text-[10px] font-semibold tabular-nums leading-none",
        "group-data-[collapsible=icon]:hidden",
        colorClass,
      )}
    >
      {score}
    </span>
  );
}

export function AppSidebar(): React.ReactNode {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border" data-tour="sidebar">
      <SidebarHeader className="px-3 py-4 group-data-[collapsible=icon]:p-2">
        <Link to="/timeline" className="flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:px-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-sidebar-accent ring-1 ring-sidebar-border">
            <img src="/nexus-icon.png" alt="" className="when-dark size-[18px]" />
            <img src="/nexus-icon-dark.png" alt="" className="when-light size-[18px]" />
          </div>
          <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
            <div className="flex items-start gap-1">
              <img src="/nexus-wordmark-light.png" alt="Nexus" className="when-dark mt-0.5 h-3.5" />
              <img src="/nexus-wordmark-dark.png" alt="Nexus" className="when-light mt-0.5 h-3.5" />
              <span className="-ml-0.5 text-[8px] font-semibold leading-none text-accent-brand">
                dev
              </span>
            </div>
            <span className="text-[9px] tracking-[0.14em] uppercase text-muted-foreground/60">
              Console
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1 group-data-[collapsible=icon]:px-0">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="mb-0.5 px-3 text-caption text-muted-foreground">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname.startsWith(item.path);
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className={cn(
                          "relative h-8 gap-2.5 rounded-md px-2.5 transition-colors",
                          isActive && "bg-sidebar-accent font-medium",
                          isActive && "before:absolute before:inset-y-1 before:left-0 before:w-[2px] before:rounded-full before:bg-accent-brand",
                        )}
                      >
                        <Link to={item.path} data-tour={item.path.slice(1)}>
                          <item.icon className="size-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                          <NavBadge item={item} />
                          {item.kbd && (
                            <KbdHint
                              keys={`mod+${item.kbd}`}
                              className="ml-auto group-data-[collapsible=icon]:hidden"
                            />
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooterSection />
      <SidebarRail />
    </Sidebar>
  );
}
