import {
  Activity,
  BarChart3,
  GitCompare,
  Globe,
  Network,
  Play,
  Server,
  Settings,
  Shield,
  Timer,
  Workflow,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import type { Theme } from "./store";

// ── Navigation ─────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: "requests" | "errors" | "runtimes" | "audit-score";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Inspect",
    items: [
      { label: "Timeline", path: "/timeline", icon: Activity, badge: "requests" },
      { label: "Waterfall", path: "/waterfall", icon: Timer },
      { label: "Analytics", path: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Build",
    items: [
      { label: "Explorer", path: "/explorer", icon: Network },
      { label: "Playground", path: "/playground", icon: Play },
      { label: "APIs", path: "/apis", icon: Globe },
      { label: "Mocks", path: "/mocks", icon: Server },
    ],
  },
  {
    label: "Quality",
    items: [
      { label: "Audit", path: "/audit", icon: Shield, badge: "audit-score" },
      { label: "Middleware", path: "/middleware", icon: Workflow },
      { label: "Compare", path: "/compare", icon: GitCompare },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings", path: "/settings", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// ── Theme cycle ────────────────────────────────────────────────────────────

const THEME_CYCLE: Theme[] = ["dark", "light", "system"];

export function nextTheme(current: Theme): Theme {
  const idx = THEME_CYCLE.indexOf(current);
  return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
}

export const THEME_LABELS: Record<Theme, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

// ── Breadcrumb helpers ─────────────────────────────────────────────────────

export function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Welcome";
  const item = ALL_NAV_ITEMS.find((n) => pathname.startsWith(n.path));
  return item?.label ?? "Not Found";
}

export function getPageGroup(pathname: string): string | null {
  for (const group of NAV_GROUPS) {
    if (group.items.some((n) => pathname.startsWith(n.path))) {
      return group.label;
    }
  }
  return null;
}
