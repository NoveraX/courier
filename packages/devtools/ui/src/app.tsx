import { useSocketConnection } from "./socket"
import { useDevToolsStore } from "./store"
import { TABS, THEME_ICONS, THEME_CYCLE } from "./app-config"
import { ToastOverlay } from "./components/toast-overlay"
import { TimelineView } from "./views/timeline"
import { WaterfallView } from "./views/waterfall"
import { MiddlewareView } from "./views/middleware"
import { AnalyticsView } from "./views/analytics"
import { CompareView } from "./views/compare"
import { ExplorerView } from "./views/explorer"
import { PlaygroundView } from "./views/playground"
import { AuditView } from "./views/audit"
import { CodegenView } from "./views/codegen"
import { PlaceholderView } from "./views/placeholder"

// ── App Shell ───────────────────────────────────────────────────────────────

export function App() {
  useSocketConnection()

  const { activeTab, setActiveTab, theme, setTheme, connectionStatus, sessions, requests, paused, toasts, dismissToast } =
    useDevToolsStore()

  function nextTheme() {
    const idx = THEME_CYCLE.indexOf(theme)
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]!)
  }

  const ThemeIcon = THEME_ICONS[theme]
  const errorCount = requests.filter(
    (r) => r.status === "error" || r.status === "validation_error",
  ).length
  const pendingCount = requests.filter((r) => r.status === "pending").length

  return (
    <div className="flex h-screen flex-col bg-surface-0 text-text-primary">
      <div className="flex flex-1 overflow-hidden">
        {/* ── Icon Sidebar ── */}
        <nav className="flex w-12 shrink-0 flex-col items-center border-r border-border-default bg-surface-0 py-2">
          {/* Logo */}
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15">
            <span className="text-sm font-bold text-indigo-400">N</span>
          </div>

          {/* Tab icons */}
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
                  {/* Tooltip */}
                  <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded bg-surface-3 px-2 py-1 text-xs text-text-primary shadow-lg group-hover:block">
                    {label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Theme toggle */}
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
          ) : (
            <PlaceholderView tab={activeTab} />
          )}
        </main>
      </div>

      {/* ── Bottom Status Bar ── */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border-default bg-surface-0 px-3 text-[11px]">
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-emerald-500"
                  : connectionStatus === "reconnecting"
                    ? "bg-amber-500 animate-pulse-dot"
                    : "bg-zinc-600"
              }`}
            />
            <span className="text-text-muted">
              {connectionStatus === "connected"
                ? sessions.length > 0
                  ? `${sessions.length} app${sessions.length > 1 ? "s" : ""} connected`
                  : "Connected, waiting for apps"
                : connectionStatus === "reconnecting"
                  ? "Reconnecting\u2026"
                  : "Disconnected"}
            </span>
          </div>

          {/* Recording indicator */}
          {paused && <span className="text-amber-400">Paused</span>}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-text-muted">{requests.length} requests</span>
          {errorCount > 0 && (
            <span className="text-red-400">
              {errorCount} error{errorCount > 1 ? "s" : ""}
            </span>
          )}
          {pendingCount > 0 && (
            <span className="text-sky-400">{pendingCount} pending</span>
          )}
        </div>
      </footer>

      {/* ── Toasts ── */}
      <ToastOverlay toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
