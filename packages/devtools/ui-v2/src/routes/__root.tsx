import { useMemo, useState } from "react";
import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Toaster } from "sonner";

import { useSocketConnection } from "@/socket";
import { useRelativeTimeTick } from "@/hooks/use-relative-time";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { ALL_NAV_ITEMS } from "@/app-config";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { StatusBar } from "@/components/layout/status-bar";
import { CommandPalette } from "@/components/layout/command-palette";
import { DisconnectedBanner } from "@/components/layout/disconnected-banner";
import { GlobalDetailPanel } from "@/components/layout/global-detail-panel";
import { NotFound } from "@/components/layout/not-found";

function RootComponent(): React.ReactNode {
  useSocketConnection();
  useRelativeTimeTick();

  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = useState(false);

  const hotkeyMap = useMemo(() => {
    const map: Record<string, (e: KeyboardEvent) => void> = {
      "mod+k": () => setCommandOpen(true),
      "Escape": () => setCommandOpen(false),
    };

    // Cmd+1-9 for quick nav
    for (const item of ALL_NAV_ITEMS) {
      if (item.kbd) {
        map[`mod+${item.kbd}`] = () => navigate({ to: item.path });
      }
    }

    return map;
  }, [navigate]);

  useHotkeys(hotkeyMap);

  return (
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "3rem" } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="flex min-h-0 flex-col overflow-hidden">
        <DisconnectedBanner />
        <TopBar onOpenSearch={() => setCommandOpen(true)} />
        <GlobalDetailPanel>
          <Outlet />
        </GlobalDetailPanel>
        <StatusBar />
      </SidebarInset>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ className: "text-body-sm" }}
      />
    </SidebarProvider>
  );
}

function RootNotFound(): React.ReactNode {
  return <NotFound />;
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: RootNotFound,
});
