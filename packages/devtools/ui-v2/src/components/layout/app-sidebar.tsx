import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { useDevToolsStore } from "@/store";
import { NAV_GROUPS } from "@/app-config";
import type { NavItem } from "@/app-config";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from "@/components/ui/sidebar";
import { SidebarFooterSection } from "./sidebar-footer";

function NavBadge({ item }: { item: NavItem }): React.ReactNode {
  const requests = useDevToolsStore((s) => s.requests);
  if (!item.badge) return null;

  let count = 0;
  if (item.badge === "requests") count = requests.length;
  if (item.badge === "errors") count = requests.filter((r) => r.status === "error").length;
  if (item.badge === "sessions") count = useDevToolsStore.getState().sessions.length;

  if (count === 0) return null;

  return (
    <SidebarMenuBadge
      className={cn(
        "text-[10px] tabular-nums",
        item.badge === "errors" && count > 0 && "text-destructive-foreground",
      )}
    >
      {count > 999 ? "999+" : count}
    </SidebarMenuBadge>
  );
}

export function AppSidebar(): React.ReactNode {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-3 py-4">
        <Link to="/timeline" className="flex items-center gap-2.5 px-1">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-brand text-accent-brand-foreground shadow-sm">
            <span className="text-xs font-bold leading-none">N</span>
          </div>
          <div className="flex flex-col gap-0 group-data-[collapsible=icon]:hidden">
            <span className="text-body-sm font-semibold leading-none tracking-tight">
              Nexus
            </span>
            <span className="text-[10px] leading-none text-muted-foreground">
              DevTools
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1">
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
                        <Link to={item.path}>
                          <item.icon className="size-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                          {item.kbd && (
                            <span className="ml-auto text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                              {"\u2318"}{item.kbd}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                      <NavBadge item={item} />
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
