import { ChevronDown, Lock, Server } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";

import { focusOnClose } from "@/design/focus-on-close";
import { POP_MOTION } from "@/design/overlay-motion";
import type { PageMark } from "@/features/apis/types";
import { pageMarkTitle } from "@/features/explorer/page-mark-title";
import { cn } from "@/lib/utils";

interface NotExposedChipProps {
  mark: PageMark;
  /** Runs the call as server code, in Direct mode; `undefined` while a call is under way. */
  onRunAsServer?: (() => void) | undefined;
}

/**
 * The URL bar's warning, in Proxy mode, that the proxy refuses the
 * endpoint to a page. It opens on why, and on running the call as server
 * code instead: Direct mode, on the app's runtime, which reaches every
 * endpoint, marked or not. The proxy itself is left as it is, so a page's
 * call is still refused.
 *
 * @param props - The endpoint's page mark, and what runs the call as server code
 * @returns The chip, and what it opens
 * @example
 * ```tsx
 * <NotExposedChip mark={{ exposed: false, reason: "nothing marks it .expose()" }} onRunAsServer={run} />
 * ```
 */
export function NotExposedChip({ mark, onRunAsServer }: NotExposedChipProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        title={`${pageMarkTitle(mark)}. Mark it .expose() where it is defined to call it from a page.`}
        className="flex h-5.5 shrink-0 cursor-pointer items-center gap-1.25 rounded-[5px] bg-warn-dim px-1.5 font-sans text-meta text-warn transition-colors hover:bg-warn/20 focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:bg-warn/20"
      >
        <Lock aria-hidden="true" className="size-2.75 shrink-0" />
        not exposed
        <ChevronDown aria-hidden="true" className="size-2.5 shrink-0" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          aria-label="Not exposed"
          onCloseAutoFocus={focusOnClose}
          className={cn(
            "z-50 flex w-[min(320px,calc(100vw-16px))] flex-col gap-3 rounded-dialog bg-panel p-3.5 shadow-overlay",
            POP_MOTION,
          )}
        >
          <p className="m-0 text-small text-fg-muted">{pageMarkTitle(mark)}.</p>
          <button
            type="button"
            disabled={onRunAsServer === undefined}
            onClick={() => {
              setOpen(false);
              onRunAsServer?.();
            }}
            className="flex h-8 cursor-pointer items-center justify-center gap-1.75 rounded-card bg-brand text-control font-semibold text-bg transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-50 pointer-coarse:h-10"
          >
            <Server aria-hidden="true" className="size-3.25" />
            Run as server code
          </button>
          <p className="m-0 text-label text-fg-subtle">
            Direct mode runs the call as your server code does, on the app's runtime, which reaches
            every endpoint. To call it from a page, mark it .expose() where it is defined.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
