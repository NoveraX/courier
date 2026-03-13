import { useState, useMemo } from "react"

import { useSocketConnection } from "./socket"
import { useDevToolsStore } from "./store"
import type { Tab } from "./store"
import { TABS, THEME_ICONS, THEME_CYCLE } from "./app-config"
import { ToastOverlay } from "./components/toast-overlay"
import { CommandPalette } from "./components/command-palette"
import { StatusBar } from "./components/status-bar"
import { useHotkeys } from "./components/use-hotkeys"
import { TimelineView } from "./views/timeline"
import { WaterfallView } from "./views/waterfall"
import { MiddlewareView } from "./views/middleware"
import { AnalyticsView } from "./views/analytics"
import { CompareView } from "./views/compare"
import { ExplorerView } from "./views/explorer"
import { PlaygroundView } from "./views/playground"
import { AuditView } from "./views/audit"
import { CodegenView } from "./views/codegen"
import { SettingsView } from "./views/settings"
import { PlaceholderView } from "./views/placeholder"

// Tab order for number key shortcuts (1-9 maps to first 9 tabs)
const TAB_ORDER: Tab[] = [
  "timeline", "waterfall", "middleware", "analytics",
  "explorer", "playground", "audit", "codegen", "compare",
]

// ── App Shell ───────────────────────────────────────────────────────────────

export function App() {
  useSocketConnection()
  const [commandOpen, setCommandOpen] = useState(false)

  const {
    activeTab, setActiveTab, theme, setTheme,
    toasts, dismissToast,
    togglePaused, clearRequests, setTimelineShowFilters,
  } = useDevToolsStore()

  // Global keyboard shortcuts
  const hotkeys = useMemo(() => [
    { key: "k", meta: true, handler: () => setCommandOpen(true) },
    { key: "e", meta: true, handler: () => clearRequests() },
    { key: "p", meta: true, handler: () => togglePaused() },
    { key: "f", meta: true, handler: () => { setActiveTab("timeline"); setTimelineShowFilters(true) } },
    { key: ",", meta: true, handler: () => setActiveTab("settings") },
    ...TAB_ORDER.map((tab, i) => ({
      key: String(i + 1),
      handler: () => setActiveTab(tab),
    })),
  ], [setActiveTab, clearRequests, togglePaused, setTimelineShowFilters])

  useHotkeys(hotkeys)

  function nextTheme() {
    const idx = THEME_CYCLE.indexOf(theme)
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]!)
  }

  const ThemeIcon = THEME_ICONS[theme]

  return (
    <div className="flex h-screen flex-col bg-surface-0 text-text-primary">
      <div className="flex flex-1 overflow-hidden">
        {/* ── Icon Sidebar ── */}
        <nav className="flex w-12 shrink-0 flex-col items-center border-r border-border-default bg-surface-0 py-2">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15">
            <span className="text-sm font-bold text-indigo-400">N</span>
          </div>

          <div className="flex flex-1 flex-col items-center gap-0.5">
            {TABS.map(({ id, icon: Icon, label }) => {
              const isActive = activeTab === id
              return (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => setActiveTab(id)}
                  className={`group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? "bg-surface-2 text-text-primary"
                      : "text-text-muted hover:bg-surface-1 hover:text-text-secondary"
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                  <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded bg-surface-3 px-2 py-1 text-xs text-text-primary shadow-lg group-hover:block">
                    {label}
                  </span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            title={`Theme: ${theme}`}
            onClick={nextTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
          >
            <ThemeIcon size={16} />
          </button>
        </nav>

        {/* ── Main Content ── */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {activeTab === "timeline" ? (
            <TimelineView />
          ) : activeTab === "waterfall" ? (
            <WaterfallView />
          ) : activeTab === "middleware" ? (
            <MiddlewareView />
          ) : activeTab === "analytics" ? (
            <AnalyticsView />
          ) : activeTab === "compare" ? (
            <CompareView />
          ) : activeTab === "explorer" ? (
            <ExplorerView />
          ) : activeTab === "playground" ? (
            <PlaygroundView />
          ) : activeTab === "audit" ? (
            <AuditView />
          ) : activeTab === "codegen" ? (
            <CodegenView />
          ) : activeTab === "settings" ? (
            <SettingsView />
          ) : (
            <PlaceholderView tab={activeTab} />
          )}
        </main>
      </div>

      <StatusBar />
      <ToastOverlay toasts={toasts} onDismiss={dismissToast} />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  )
}
