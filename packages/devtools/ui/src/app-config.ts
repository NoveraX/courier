import {
  Activity,
  GitBranch,
  Layers,
  BarChart3,
  Network,
  Play,
  ShieldCheck,
  ChevronsLeftRightEllipsis,
  GitCompare,
  Settings,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

import type { Theme } from "./store";

// ── Tab config ──────────────────────────────────────────────────────────────

export const TABS: { to: string; icon: typeof Activity; label: string }[] = [
  { to: "/timeline", icon: Activity, label: "Timeline" },
  { to: "/waterfall", icon: GitBranch, label: "Waterfall" },
  { to: "/middleware", icon: Layers, label: "Middleware" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/explorer", icon: Network, label: "API Explorer" },
  { to: "/playground", icon: Play, label: "Playground" },
  { to: "/audit", icon: ShieldCheck, label: "Audit" },
  { to: "/apis", icon: ChevronsLeftRightEllipsis, label: "APIs" },
  { to: "/compare", icon: GitCompare, label: "Compare" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

// Route paths for keyboard shortcuts (1-9 maps to first 9 tabs)
export const TAB_ROUTES = TABS.slice(0, 9).map((t) => t.to);

export const THEME_ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export const THEME_CYCLE: Theme[] = ["dark", "light", "system"];
