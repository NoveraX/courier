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
} from "lucide-react"

import type { Tab } from "../store"

// ── Tab → Icon mapping ───────────────────────────────────────────────────────

const TAB_ICONS: Record<Tab, typeof Activity> = {
  timeline: Activity,
  waterfall: GitBranch,
  middleware: Layers,
  analytics: BarChart3,
  explorer: Network,
  playground: Play,
  audit: ShieldCheck,
  codegen: Code,
  compare: GitCompare,
  settings: Settings,
}

const TAB_LABELS: Record<Tab, string> = {
  timeline: "Timeline",
  waterfall: "Waterfall",
  middleware: "Middleware",
  analytics: "Analytics",
  explorer: "API Explorer",
  playground: "Playground",
  audit: "Audit",
  codegen: "Codegen",
  compare: "Compare",
  settings: "Settings",
}

// ── Placeholder View ─────────────────────────────────────────────────────────

export function PlaceholderView({ tab }: { tab: Tab }) {
  const Icon = TAB_ICONS[tab]

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-muted">
      <Icon size={40} strokeWidth={1} />
      <p className="text-sm font-medium text-text-secondary">{TAB_LABELS[tab]}</p>
      <p className="text-xs">Coming soon</p>
    </div>
  )
}
