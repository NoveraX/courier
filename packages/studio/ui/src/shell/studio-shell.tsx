import { Outlet } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useHotkeys } from "@/hooks/use-hotkeys";
import { MockRequestInspector } from "@/inspector/mock-request-inspector";
import { RequestInspector } from "@/inspector/request-inspector";
import { SessionFileDialog } from "@/screens/session-file/session-file-dialog";
import { CommandPalette } from "./command-palette/command-palette";
import { useRunAction } from "./command-palette/use-run-action";
import { ConnectionBanner } from "./connection-banner";
import { DemoBanner } from "./demo-banner";
import { Header } from "./header/header";
import { Sidebar } from "./sidebar/sidebar";
import { StatusBar } from "./status-bar/status-bar";
import { StorageBanner } from "./storage-banner";

/**
 * Studio's frame around every view: the sidebar, the header, a banner while
 * Studio cannot be reached and one for a visitor of a public demo, the view,
 * the status bar, the request inspector
 * over the view while a request is open, the session file looked over
 * before it is shared, and the command palette — ⌘K
 * opens it, ⌘. pauses or resumes recording, ⇧⌘L changes the theme, ⌘E
 * exports the requests and ⌘⌫ clears them.
 *
 * @returns The shell, with the current view inside
 * @example
 * ```tsx
 * createRootRoute({ component: StudioShell });
 * ```
 */
export function StudioShell(): React.ReactNode {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const run = useRunAction();
  const hotkeys = useMemo(
    () => ({
      "mod+k": () => setPaletteOpen(true),
      "mod+.": () => run({ kind: "toggle-recording" }),
      "mod+shift+l": () => run({ kind: "toggle-theme" }),
      "mod+e": () => run({ kind: "export" }),
      "mod+backspace": () => run({ kind: "clear-requests" }),
    }),
    [run],
  );
  useHotkeys(hotkeys);
  return (
    <div className="grid h-screen grid-cols-[236px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_24px] overflow-hidden bg-bg max-[820px]:grid-cols-[minmax(0,1fr)]">
      <Sidebar />
      <div className="row-start-1 flex min-h-0 min-w-0 flex-col">
        <Header onOpenPalette={() => setPaletteOpen(true)} />
        <ConnectionBanner />
        <DemoBanner />
        <StorageBanner />
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <StatusBar />
      <RequestInspector />
      <MockRequestInspector />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <SessionFileDialog />
    </div>
  );
}
