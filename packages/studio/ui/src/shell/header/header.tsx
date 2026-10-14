import { useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { Shortcut } from "@/design/shortcut";
import { Breadcrumbs } from "./breadcrumbs";
import { NavButton } from "./nav-button";
import { RecordingButton } from "./recording-button";
import { ThemeButton } from "./theme-button";

interface HeaderProps {
  onOpenPalette: () => void;
  /** Whether the navigation drawer is open, what opens it, and the button it gives the focus back to. */
  nav: { open: boolean; onOpen: () => void; buttonRef: React.Ref<HTMLButtonElement> };
}

/**
 * The bar over every view: the way to the navigation drawer where the
 * sidebar has no room, where the page sits, the command palette,
 * recording — on the setup page only once there is something to record —
 * and the theme. It keeps clear of a phone's notch and status bar. On a
 * phone the page's group gives way to its name, the palette is a search
 * button, and the theme is in the drawer.
 *
 * @param props - What opens the palette, and the drawer's state
 * @returns The header
 * @example
 * ```tsx
 * <Header onOpenPalette={() => setPaletteOpen(true)} nav={{ open, onOpen, buttonRef }} />
 * ```
 */
export function Header({ onOpenPalette, nav }: HeaderProps): React.ReactNode {
  const onSetup = useRouterState({ select: (s) => s.location.pathname === "/" });
  return (
    <header className="flex h-[calc(46px+env(safe-area-inset-top))] shrink-0 items-center gap-3.5 border-b border-line bg-bg pt-[env(safe-area-inset-top)] pr-[max(16px,env(safe-area-inset-right))] pl-[max(20px,env(safe-area-inset-left))] max-sm:gap-2.5">
      <NavButton ref={nav.buttonRef} open={nav.open} onOpen={nav.onOpen} />
      <Breadcrumbs />
      <span className="flex-1" />
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Search or jump to…"
        className="flex h-7.5 w-70 max-w-[30vw] cursor-pointer items-center gap-2.5 rounded-control border border-line bg-panel pr-1.5 pl-2.75 text-left text-control text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-9 max-sm:size-9 max-sm:max-w-none max-sm:justify-center max-sm:px-0"
      >
        <Search aria-hidden="true" className="size-3.25 shrink-0 max-sm:size-4" />
        <span className="flex-1 truncate max-sm:hidden">Search or jump to…</span>
        <Shortcut keys={["mod", "K"]} className="pointer-coarse:hidden max-sm:hidden" />
      </button>
      <RecordingButton hideIdle={onSetup} />
      <ThemeButton />
    </header>
  );
}
