import { Link, useRouterState } from "@tanstack/react-router";

import type { NavGroup } from "../app-config";

import { SIDEBAR_GROUPS, SETTINGS_NAV } from "../app-config";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { SidebarFooterContent } from "./sidebar-footer";
import { useDevToolsStore } from "../store";

// ── Helpers ─────────────────────────────────────────────────────────────────

function isRouteActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + "/");
}

function useBadgeCount(to: string): number | null {
  const requests = useDevToolsStore((s) => s.requests);

  if (to === "/timeline") return requests.length || null;
  if (to === "/audit") {
    const errors = requests.filter(
      (r) => r.status === "error" || r.status === "validation_error",
    ).length;
    return errors || null;
  }
  return null;
}

// ── Nav Group ───────────────────────────────────────────────────────────────

function SidebarNavGroup({ group, pathname }: { group: NavGroup; pathname: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => (
            <SidebarNavItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              shortcut={item.shortcut}
              isActive={isRouteActive(pathname, item.to)}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SidebarNavItem({
  to,
  icon: Icon,
  label,
  shortcut,
  isActive,
}: {
  to: string;
  icon: typeof SETTINGS_NAV.icon;
  label: string;
  shortcut?: string;
  isActive: boolean;
}) {
  const badge = useBadgeCount(to);
  const tip = shortcut ? `${label} (${shortcut})` : label;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={tip}>
        <Link to={to} preload="intent">
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {badge != null && <SidebarMenuBadge>{badge}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
}

// ── App Sidebar ─────────────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Nexus DevTools">
              <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/15">
                <span className="text-sm font-bold text-indigo-400">N</span>
              </div>
              <span className="truncate font-semibold">Nexus DevTools</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {SIDEBAR_GROUPS.map((group) => (
          <SidebarNavGroup key={group.label} group={group} pathname={pathname} />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarNavItem
            to={SETTINGS_NAV.to}
            icon={SETTINGS_NAV.icon}
            label={SETTINGS_NAV.label}
            shortcut={SETTINGS_NAV.shortcut}
            isActive={isRouteActive(pathname, SETTINGS_NAV.to)}
          />
        </SidebarMenu>
        <SidebarSeparator />
        <SidebarFooterContent />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
