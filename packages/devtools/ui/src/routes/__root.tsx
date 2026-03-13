import { useState, useMemo } from "react";
import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useSocketConnection } from "../socket";
import { useDevToolsStore } from "../store";
import { TAB_ROUTES } from "../app-config";
import { CommandPalette } from "../components/command-palette";
import { StatusBar } from "../components/status-bar";
import { useHotkeys } from "../components/use-hotkeys";
import { AppSidebar } from "../components/app-sidebar";
import { TopBar } from "../components/top-bar";

function RootComponent() {
  useSocketConnection();
  const [commandOpen, setCommandOpen] = useState(false);
  const navigate = useNavigate();

  const { togglePaused, clearRequests } = useDevToolsStore();

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

  return (
    <SidebarProvider
      defaultOpen={false}
      style={{ "--sidebar-width": "13.75rem" } as React.CSSProperties}
      className="h-screen! min-h-0!"
    >
      <AppSidebar />

      <SidebarInset className="flex flex-col overflow-hidden">
        <TopBar onSearchClick={() => setCommandOpen(true)} />
        <main className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
        <StatusBar />
      </SidebarInset>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <Toaster />
    </SidebarProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
