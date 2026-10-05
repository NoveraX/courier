import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ChartColumn,
  GitCompare,
  Globe,
  Network,
  Play,
  Server,
  Shield,
  Timer,
  Workflow,
} from "lucide-react";

/** A count or score the sidebar shows beside a view. */
export type NavBadgeKind = "requests" | "audit-score";

/** A view in the sidebar. */
export interface ShellNavItem {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  icon: LucideIcon;
  badge?: NavBadgeKind;
}

/** A group of views, under its heading. */
export interface ShellNavGroup {
  label: string;
  items: readonly ShellNavItem[];
}

/**
 * Studio's views, grouped as the sidebar shows them. A view not yet built
 * on the new shell links to its current page.
 */
export const SHELL_NAV: readonly ShellNavGroup[] = [
  {
    label: "Inspect",
    items: [
      { label: "Timeline", to: "/next/timeline", icon: Activity, badge: "requests" },
      { label: "Waterfall", to: "/next/waterfall", icon: Timer },
      { label: "Analytics", to: "/next/analytics", icon: ChartColumn },
    ],
  },
  {
    label: "Build",
    items: [
      { label: "Explorer", to: "/next/explorer", icon: Network },
      { label: "Playground", to: "/next/playground", icon: Play },
      { label: "APIs", to: "/next/apis", icon: Globe },
      { label: "Mocks", to: "/next/mocks", icon: Server },
    ],
  },
  {
    label: "Quality",
    items: [
      { label: "Audit", to: "/next/audit", icon: Shield, badge: "audit-score" },
      { label: "Middleware", to: "/next/middleware", icon: Workflow },
      { label: "Compare", to: "/next/compare", icon: GitCompare },
    ],
  },
];

/** Settings, which the sidebar keeps at its foot rather than among the views. */
export const SETTINGS_PAGE = { label: "Settings", group: "System", to: "/next/settings" } as const;

/** Where Courier's documentation lives. */
export const DOCS_URL = "https://courier.noverax.cloud";
