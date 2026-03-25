import { useMemo, useState } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";

import { useSocketConnection } from "@/socket";
import { useTickProvider } from "@/hooks/use-tick";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { StatusBar } from "@/components/layout/status-bar";
import { CommandPalette } from "@/components/layout/command-palette";
import { DisconnectedBanner } from "@/components/layout/disconnected-banner";
import { GlobalDetailPanel } from "@/components/layout/global-detail-panel";
import { SkipNav, MAIN_CONTENT_ID } from "@/components/layout/skip-nav";
import { TourProvider } from "@/components/onboarding/tour-provider";
import { NotFound } from "@/components/layout/not-found";

function RootComponent(): React.ReactNode {
  useSocketConnection();
  useTickProvider();

  const [commandOpen, setCommandOpen] = useState(false);

  const hotkeyMap = useMemo<Record<string, (e: KeyboardEvent) => void>>(() => ({
    "mod+k": () => setCommandOpen(true),
    "Escape": () => setCommandOpen(false),
  }), []);

  useHotkeys(hotkeyMap);

  return (
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "3rem" } as React.CSSProperties}
    >
      <SkipNav />
      <AppSidebar />
      <SidebarInset id={MAIN_CONTENT_ID} className="flex min-h-0 flex-col overflow-hidden">
        <DisconnectedBanner />
        <TopBar onOpenSearch={() => setCommandOpen(true)} />
        <GlobalDetailPanel>
          <Outlet />
        </GlobalDetailPanel>
        <StatusBar />
      </SidebarInset>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <TourProvider />
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
