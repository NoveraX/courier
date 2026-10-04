import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { Toaster } from "sonner";

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
      offset={40}
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
            "flex min-h-8.5 max-w-[min(560px,calc(100vw-32px))] items-center gap-2 rounded-[9px] bg-fg px-3.5 py-2 font-sans text-control font-strong tracking-ui text-bg shadow-overlay",
          icon: "flex shrink-0",
          title: "leading-snug",
          description: "text-small font-normal opacity-75",
        },
      }}
    />
  );
}
