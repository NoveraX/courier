import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { Toaster } from "sonner";

/* Sonner stacks toasts in a list 356 px wide and pins each to its left edge; the list
   takes the widest toast a message may need, and each toast centres itself in it. */
const TOASTER_STYLE: React.CSSProperties & Record<"--width", string> = {
  "--width": "min(560px, calc(100vw - 32px))",
};

/* Over the status bar, which a phone lifts clear of its home indicator. Sonner takes a
   window under 600 px for a phone's and keeps a separate offset for it. */
const OVER_STATUS_BAR = "calc(40px + env(safe-area-inset-bottom))";

/**
 * The new shell's toasts: one line on the page's own colour, low in the
 * middle, over the status bar.
 *
 * @returns The toaster
 * @example
 * ```tsx
 * <ShellToaster />
 * ```
 */
export function ShellToaster(): React.ReactNode {
  return (
    <Toaster
      position="bottom-center"
      offset={OVER_STATUS_BAR}
      mobileOffset={{ bottom: OVER_STATUS_BAR }}
      style={TOASTER_STYLE}
      icons={{
        success: <Check aria-hidden="true" className="size-3.25" />,
        error: <CircleAlert aria-hidden="true" className="size-3.25 text-err" />,
        warning: <TriangleAlert aria-hidden="true" className="size-3.25 text-warn" />,
        info: <Info aria-hidden="true" className="size-3.25" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex min-h-8.5 max-w-full items-center gap-2 rounded-[9px] bg-fg px-3.5 py-2 font-sans text-control font-strong tracking-ui text-bg shadow-overlay min-[600px]:inset-x-0 min-[600px]:mx-auto min-[600px]:w-fit",
          icon: "flex shrink-0",
          title: "leading-snug",
          description: "text-small font-normal opacity-75",
        },
      }}
    />
  );
}
