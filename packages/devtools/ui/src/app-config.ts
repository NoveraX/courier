import {
  Activity,
  GitBranch,
  Layers,
  BarChart3,
  Network,
  Play,
  ShieldCheck,
  Code,
  GitCompare,
  Settings,
  Sun,
  Moon,
  Monitor,
} from "lucide-react"

import type { Tab, Theme } from "./store"

// ── Tab config ──────────────────────────────────────────────────────────────

export const TABS: { id: Tab; icon: typeof Activity; label: string }[] = [
  { id: "timeline", icon: Activity, label: "Timeline" },
  { id: "waterfall", icon: GitBranch, label: "Waterfall" },
  { id: "middleware", icon: Layers, label: "Middleware" },
  { id: "analytics", icon: BarChart3, label: "Analytics" },
  { id: "explorer", icon: Network, label: "API Explorer" },
  { id: "playground", icon: Play, label: "Playground" },
  { id: "audit", icon: ShieldCheck, label: "Audit" },
  { id: "codegen", icon: Code, label: "Codegen" },
  { id: "compare", icon: GitCompare, label: "Compare" },
  { id: "settings", icon: Settings, label: "Settings" },
]

export const THEME_ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

export const THEME_CYCLE: Theme[] = ["dark", "light", "system"]
