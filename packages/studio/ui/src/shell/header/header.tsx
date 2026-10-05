import { useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { Kbd } from "@/design/kbd";
import { Breadcrumbs } from "./breadcrumbs";
import { RecordingButton } from "./recording-button";
import { ThemeButton } from "./theme-button";

interface HeaderProps {
  onOpenPalette: () => void;
}

/**
 * The bar over every view: where the page sits, the command palette,
 * recording — on the setup page only once there is something to record —
 * and the theme.
 *
 * @param props - What opens the palette
 * @returns The header
 * @example
 * ```tsx
 * <Header onOpenPalette={() => setPaletteOpen(true)} />
 * ```
 */
export function Header({ onOpenPalette }: HeaderProps): React.ReactNode {
  const onSetup = useRouterState({ select: (s) => s.location.pathname === "/" });
  return (
    <header className="flex h-11.5 shrink-0 items-center gap-3.5 border-b border-line bg-bg pr-4 pl-5">
      <Breadcrumbs />
      <span className="flex-1" />
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex h-7.5 w-70 max-w-[30vw] cursor-pointer items-center gap-2.5 rounded-control border border-line bg-panel pr-1.5 pl-2.75 text-left text-control text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-brand"
      >
        <Search aria-hidden="true" className="size-3.25 shrink-0" />
        <span className="flex-1 truncate">Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <RecordingButton hideIdle={onSetup} />
      <ThemeButton />
    </header>
  );
}
