import {
  Activity,
  GitBranch,
  BarChart3,
  Network,
  Play,
  Layers,
  ShieldCheck,
  ChevronsLeftRightEllipsis,
  GitCompare,
  Settings,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import type { Theme } from "./store";

// ── Types ───────────────────────────────────────────────────────────────────

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  shortcut?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// ── Sidebar navigation groups ───────────────────────────────────────────────

export const SIDEBAR_GROUPS: NavGroup[] = [
  {
    label: "Inspect",
    items: [
      { to: "/timeline", icon: Activity, label: "Timeline", shortcut: "1" },
      { to: "/waterfall", icon: GitBranch, label: "Waterfall", shortcut: "2" },
      { to: "/analytics", icon: BarChart3, label: "Analytics", shortcut: "3" },
    ],
  },
  {
    label: "Build",
    items: [
      { to: "/explorer", icon: Network, label: "Explorer", shortcut: "4" },
      { to: "/playground", icon: Play, label: "Playground", shortcut: "5" },
      { to: "/apis", icon: ChevronsLeftRightEllipsis, label: "APIs", shortcut: "6" },
    ],
  },
  {
    label: "Quality",
    items: [
      { to: "/audit", icon: ShieldCheck, label: "Audit", shortcut: "7" },
      { to: "/middleware", icon: Layers, label: "Middleware", shortcut: "8" },
      { to: "/compare", icon: GitCompare, label: "Compare", shortcut: "9" },
    ],
  },
];

export const SETTINGS_NAV: NavItem = {
  to: "/settings",
  icon: Settings,
  label: "Settings",
  shortcut: "⌘,",
};

// Flat list of all nav items (for keyboard shortcuts: keys 1-9)
export const ALL_NAV_ITEMS: NavItem[] = SIDEBAR_GROUPS.flatMap((g) => g.items);
export const TAB_ROUTES = ALL_NAV_ITEMS.map((item) => item.to);

// ── Theme ───────────────────────────────────────────────────────────────────

export const THEME_ICONS: Record<Theme, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export const THEME_CYCLE: Theme[] = ["dark", "light", "system"];
