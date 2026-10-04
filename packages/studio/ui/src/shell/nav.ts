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
      { label: "Waterfall", to: "/waterfall", icon: Timer },
      { label: "Analytics", to: "/analytics", icon: ChartColumn },
    ],
  },
  {
    label: "Build",
    items: [
      { label: "Explorer", to: "/explorer", icon: Network },
      { label: "Playground", to: "/playground", icon: Play },
      { label: "APIs", to: "/apis", icon: Globe },
      { label: "Mocks", to: "/mocks", icon: Server },
    ],
  },
  {
    label: "Quality",
    items: [
      { label: "Audit", to: "/audit", icon: Shield, badge: "audit-score" },
      { label: "Middleware", to: "/middleware", icon: Workflow },
      { label: "Compare", to: "/compare", icon: GitCompare },
    ],
  },
];

/** Where Courier's documentation lives. */
export const DOCS_URL = "https://courier.noverax.cloud";
