import { useState, useMemo } from "react";
import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useSocketConnection } from "../socket";
import { useDevToolsStore } from "../store";
import { TAB_ROUTES, THEME_ICONS, THEME_CYCLE } from "../app-config";
import { ToastOverlay } from "../components/toast-overlay";
import { CommandPalette } from "../components/command-palette";
import { StatusBar } from "../components/status-bar";
import { useHotkeys } from "../components/use-hotkeys";
import { Sidebar } from "../components/sidebar";

function RootComponent() {
  useSocketConnection();
  const [commandOpen, setCommandOpen] = useState(false);
  const navigate = useNavigate();

  const {
    theme, setTheme,
    toasts, dismissToast,
    togglePaused, clearRequests,
  } = useDevToolsStore();

  const hotkeys = useMemo(() => [
    { key: "k", meta: true, handler: () => setCommandOpen(true) },
    { key: "e", meta: true, handler: () => clearRequests() },
    { key: "p", meta: true, handler: () => togglePaused() },
    { key: "f", meta: true, handler: () => { void navigate({ to: "/timeline", search: { filters: true } }); } },
    { key: ",", meta: true, handler: () => { void navigate({ to: "/settings" }); } },
    ...TAB_ROUTES.map((to, i) => ({
      key: String(i + 1),
      handler: () => { void navigate({ to }); },
    })),
  ], [navigate, clearRequests, togglePaused]);

  useHotkeys(hotkeys);

  function nextTheme() {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]!);
  }

  const ThemeIcon = THEME_ICONS[theme];

  return (
    <div className="flex h-screen flex-col bg-surface-0 text-text-primary">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar themeIcon={ThemeIcon} theme={theme} onThemeToggle={nextTheme} />

        <main className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>

      <StatusBar />
      <ToastOverlay toasts={toasts} onDismiss={dismissToast} />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
