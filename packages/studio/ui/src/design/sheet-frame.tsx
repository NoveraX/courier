import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { SHEET_VARIANTS } from "./motion";

interface SheetFrameProps {
  /** What a screen reader calls the sheet. */
  label: string;
  /** Its width class. */
  width: string;
  /** An inspector sits over the endpoint panel it was opened from. */
  layer: "panel" | "inspector";
  /** Called once the sheet has come in, so its parts stop arriving one by one. */
  onShown?: (() => void) | undefined;
  children: React.ReactNode;
}

/* Below `sm` a sheet takes the whole screen, clear of a phone's notch and home indicator. */
const FULL_SCREEN =
  "max-sm:inset-0 max-sm:w-full max-sm:rounded-none max-sm:border-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]";

/**
 * The frame of every sheet at the window's right edge — the request
 * inspector, a mock request, an endpoint: it springs in from the right out
 * of a soft blur and slides back out as it goes, inside the
 * `AnimatePresence` that shows it. It stops above the status bar and clear
 * of a phone's rounded corners; on a phone it takes the whole screen.
 *
 * @param props - The sheet's name, width and layer, what follows its arrival, and its content
 * @returns The sheet
 * @example
 * ```tsx
 * <SheetFrame label="Endpoint" width="w-[min(440px,calc(100vw-16px))]" layer="panel">…</SheetFrame>
 * ```
 */
export function SheetFrame({
  label,
  width,
  layer,
  onShown,
  children,
}: SheetFrameProps): React.ReactNode {
  return (
    <motion.aside
      aria-label={label}
      variants={SHEET_VARIANTS}
      initial="hidden"
      animate="shown"
      exit="gone"
      onAnimationComplete={(definition) => {
        if (definition === "shown") onShown?.();
      }}
      style={{ originX: 1 }}
      className={cn(
        "fixed top-2 right-[max(8px,env(safe-area-inset-right))] bottom-[calc(32px+env(safe-area-inset-bottom))] flex flex-col overflow-hidden rounded-sheet border border-line-strong bg-panel shadow-overlay",
        layer === "inspector" ? "z-40" : "z-30",
        width,
        FULL_SCREEN,
      )}
    >
      {children}
    </motion.aside>
  );
}
