import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { Dialog } from "radix-ui";

import { cn } from "@/lib/utils";
import { DIALOG_MOTION, SCRIM_MOTION } from "./overlay-motion";

interface DialogFrameProps {
  open: boolean;
  onClose: () => void;
  /** While true, a click outside and Esc leave the dialog open; the close button still closes it. */
  keepOpen: boolean;
  /** While false, the close button is hidden: something is in flight. */
  closable: boolean;
  title: string;
  description?: string | undefined;
  icon?: { icon: LucideIcon; tone: string } | undefined;
  /** Its width class. */
  width: string;
  /** What follows the title in the header: the steps. */
  header?: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}

/* Below `sm` a dialog takes the whole screen, clear of a phone's notch and home indicator. */
const FULL_SCREEN =
  "max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none";

/**
 * The frame of the new shell's dialogs: a dimmed backdrop, the header with
 * an icon, the title, what it is for and a close button, the steps when it
 * has some, a body that scrolls, and the footer. On a phone it takes the
 * whole screen.
 *
 * @param props - Whether it is open, what closes it and when it may, its title, icon, width, header extras, footer and body
 * @returns The dialog
 * @example
 * ```tsx
 * <DialogFrame open onClose={close} keepOpen={false} closable title="Import API" width="w-190" footer={footer}>{body}</DialogFrame>
 * ```
 */
export function DialogFrame({
  open,
  onClose,
  keepOpen,
  closable,
  title,
  description,
  icon,
  width,
  header,
  footer,
  children,
}: DialogFrameProps): React.ReactNode {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn("fixed inset-0 z-50 bg-black/45 backdrop-blur-[3px]", SCRIM_MOTION)}
        />
        <Dialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          onInteractOutside={(event) => keepOpen && event.preventDefault()}
          onEscapeKeyDown={(event) => keepOpen && event.preventDefault()}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-48px)] max-w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] bg-panel shadow-overlay outline-none",
            DIALOG_MOTION,
            width,
            FULL_SCREEN,
          )}
        >
          <div className="flex shrink-0 flex-col gap-3.5 border-b border-line px-5 pt-4.5 pb-3.5 max-sm:pt-[calc(18px+env(safe-area-inset-top))]">
            <div className="flex items-center gap-3">
              {icon && (
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-[9px]",
                    icon.tone,
                  )}
                >
                  <icon.icon aria-hidden="true" className="size-3.75" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Dialog.Title className="text-prompt font-semibold">{title}</Dialog.Title>
                {description && (
                  <Dialog.Description className="truncate text-small text-fg-subtle">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              {closable && (
                <Dialog.Close
                  aria-label={`Close ${title}`}
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-subtle hover:bg-raised hover:text-fg pointer-coarse:-mr-1 pointer-coarse:size-9"
                >
                  <X aria-hidden="true" className="size-3.75" />
                </Dialog.Close>
              )}
            </div>
            {header}
          </div>
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-5">{children}</div>
          <div className="shrink-0 max-sm:bg-panel-subtle max-sm:pb-[env(safe-area-inset-bottom)]">
            {footer}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
