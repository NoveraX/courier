import { Outlet } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { DisconnectedBanner } from "@/components/layout/disconnected-banner";
import { GlobalDetailPanel } from "@/components/layout/global-detail-panel";
import { MAIN_CONTENT_ID, SkipNav } from "@/components/layout/skip-nav";
import { StatusBar } from "@/components/layout/status-bar";
import { TopBar } from "@/components/layout/top-bar";
import { TourProvider } from "@/components/onboarding/tour-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useHotkeys } from "@/hooks/use-hotkeys";

/**
 * The frame the views not yet rebuilt are shown in: its sidebar, top bar,
 * detail panel, status bar, command palette and tour.
 *
 * @returns The frame, with the current view inside
 * @example
 * ```tsx
 * return inNewShell ? <Outlet /> : <ClassicShell />;
 * ```
 */
export function ClassicShell(): React.ReactNode {
  const [commandOpen, setCommandOpen] = useState(false);
  const hotkeyMap = useMemo<Record<string, (e: KeyboardEvent) => void>>(
    () => ({
      "mod+k": () => setCommandOpen(true),
      Escape: () => setCommandOpen(false),
    }),
    [],
  );
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
    </SidebarProvider>
  );
}
