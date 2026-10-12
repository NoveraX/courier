import { Outlet } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";

import { useHotkeys } from "@/hooks/use-hotkeys";
import { MockRequestInspector } from "@/inspector/mock-request-inspector";
import { RequestInspector } from "@/inspector/request-inspector";
import { SchemaFixDialog } from "@/screens/explorer/schema-fix-dialog";
import { RecordedTestDialog } from "@/screens/recorded-test/recorded-test-dialog";
import { SessionFileDialog } from "@/screens/session-file/session-file-dialog";
import { WebhookSendDialog } from "@/screens/webhooks/webhook-send-dialog";
import { CommandPalette } from "./command-palette/command-palette";
import { useRunAction } from "./command-palette/use-run-action";
import { ConnectionBanner } from "./connection-banner";
import { DemoBanner } from "./demo-banner";
import { Header } from "./header/header";
import { NavDrawer } from "./sidebar/nav-drawer";
import { Sidebar } from "./sidebar/sidebar";
import { StatusBar } from "./status-bar/status-bar";
import { StorageBanner } from "./storage-banner";

/**
 * Studio's frame around every view: the sidebar — or, on a narrow window
 * or a phone held sideways, the drawer the header opens in its place — the
 * header, a banner while Studio cannot be reached and one for a visitor of
 * a public demo, the view, the status bar, the request inspector
 * over the view while a request is open, the session file looked over
 * before it is shared, the test planned before it is written, and the
 * command palette — ⌘K
 * opens it, ⌘. pauses or resumes recording, ⇧⌘L changes the theme, ⌘E
 * exports the requests and ⌘⌫ clears them. It fills the screen as it is
 * now — a phone's bars shown or hidden — and keeps the view clear of a
 * phone's notch, rounded corners and home indicator.
 *
 * @returns The shell, with the current view inside
 * @example
 * ```tsx
 * createRootRoute({ component: StudioShell });
 * ```
 */
export function StudioShell(): React.ReactNode {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const navButton = useRef<HTMLButtonElement>(null);
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
    <div className="grid h-dvh grid-cols-[236px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_calc(24px+env(safe-area-inset-bottom))] overflow-hidden bg-bg shell-compact:grid-cols-[minmax(0,1fr)]">
      <Sidebar />
      <div className="row-start-1 flex min-h-0 min-w-0 flex-col">
        <Header
          onOpenPalette={() => setPaletteOpen(true)}
          nav={{ open: navOpen, onOpen: () => setNavOpen(true), buttonRef: navButton }}
        />
        <ConnectionBanner />
        <DemoBanner />
        <StorageBanner />
        <main className="min-h-0 flex-1 overflow-auto pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
          <Outlet />
        </main>
      </div>
      <StatusBar />
      <NavDrawer open={navOpen} onOpenChange={setNavOpen} returnFocusTo={navButton} />
      <RequestInspector />
      <MockRequestInspector />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <SessionFileDialog />
      <RecordedTestDialog />
      <SchemaFixDialog />
      <WebhookSendDialog />
    </div>
  );
}
