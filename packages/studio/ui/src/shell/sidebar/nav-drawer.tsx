import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect } from "react";

import { MEDIA } from "@/design/breakpoints";
import { SCRIM_MOTION } from "@/design/overlay-motion";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { StatusDetails } from "../status-bar/status-details";
import { SidebarBody } from "./sidebar-body";
import { ThemeRow } from "./theme-row";

const DRAWER_MOTION = "data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out";

interface NavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opens the drawer, which takes the focus back as it closes. */
  returnFocusTo: React.RefObject<HTMLElement | null>;
}

/* Any link followed from the drawer leaves it: a view, the setup, Settings, the docs. */
function followsLink(event: React.MouseEvent): boolean {
  return event.target instanceof Element && event.target.closest("a[href]") !== null;
}

/**
 * The sidebar for a narrow window or a phone held sideways, which have no
 * room for it: everything the sidebar holds, then the theme and the whole
 * of the status bar's status, sliding in from the left edge over a dimmed
 * view. It closes on a link followed, Esc, a tap beside it, its close
 * button, and once the window is wide enough for the sidebar again; the
 * focus goes back to the button that opened it.
 *
 * @param props - Whether it is open, what opens and closes it, and the button to give the focus back to
 * @returns The drawer
 * @example
 * ```tsx
 * <NavDrawer open={open} onOpenChange={setOpen} returnFocusTo={menuButton} />
 * ```
 */
export function NavDrawer({ open, onOpenChange, returnFocusTo }: NavDrawerProps): React.ReactNode {
  const compact = useMediaQuery(MEDIA.compactShell);
  useEffect(() => {
    if (open && !compact) onOpenChange(false);
  }, [open, compact, onOpenChange]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn("fixed inset-0 z-50 bg-black/45 backdrop-blur-[3px]", SCRIM_MOTION)}
        />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusTo.current?.focus();
          }}
          onClick={(event) => {
            if (followsLink(event)) onOpenChange(false);
          }}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[calc(min(300px,86vw)+env(safe-area-inset-left))] flex-col border-r border-line bg-bg-subtle pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-overlay outline-none",
            DRAWER_MOTION,
          )}
        >
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            <SidebarBody viewsScroll={false} closer={<CloseButton />} />
            <div className="border-t border-line px-2.5 pt-2 pb-2.5">
              <ThemeRow />
            </div>
            <StatusDetails />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CloseButton(): React.ReactNode {
  return (
    <Dialog.Close
      aria-label="Close navigation"
      className="-my-1.5 -mr-1.5 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:size-9"
    >
      <X aria-hidden="true" className="size-3.75" />
    </Dialog.Close>
  );
}
