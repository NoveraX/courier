import type { Transition, Variants } from "motion/react";

/** The curve the new shell eases into place with: quick to start, long to settle. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** The curve a surface leaves with: slow to start, then gone. */
export const EASE_IN = [0.4, 0, 1, 1] as const;

/** How long content takes to show again in a place already open: a request or tab switched to. */
export const SWAP_DURATION = 0.16;

/**
 * How a sheet comes in from the edge of the window and goes back: on a
 * spring that lands without a visible bounce, sharpening as it arrives,
 * and leaving quicker and plainer than it came. The blur is dropped once
 * the sheet has arrived, so nothing filters it while it is read.
 *
 * @example
 * ```tsx
 * <motion.aside variants={SHEET_VARIANTS} initial="hidden" animate="shown" exit="gone" />
 * ```
 */
export const SHEET_VARIANTS = {
  hidden: { opacity: 0, x: 28, scale: 0.98, filter: "blur(6px)" },
  shown: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      default: { type: "spring", visualDuration: 0.36, bounce: 0.1 },
      opacity: { duration: 0.2, ease: EASE_OUT },
      filter: { duration: 0.26, ease: EASE_OUT },
    },
    transitionEnd: { filter: "none" },
  },
  gone: {
    opacity: 0,
    x: 24,
    scale: 0.985,
    filter: "blur(4px)",
    transition: { duration: 0.18, ease: EASE_IN },
  },
} satisfies Variants;

/**
 * How a selection marker moves from one item to the next: a short spring,
 * a touch livelier than a sheet's.
 *
 * @example
 * ```tsx
 * <motion.span layoutId="tab-indicator" transition={INDICATOR_SPRING} />
 * ```
 */
export const INDICATOR_SPRING: Transition = { type: "spring", visualDuration: 0.3, bounce: 0.18 };

/**
 * How the parts of a surface follow it in as it opens: each rises a few
 * pixels into place a moment after the one before.
 *
 * @param step - The part's place in the order, from 0
 * @returns The part's transition
 * @example
 * ```tsx
 * <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={revealAfter(2)} />
 * ```
 */
export function revealAfter(step: number): Transition {
  return { delay: 0.04 + step * 0.035, duration: 0.3, ease: EASE_OUT };
}
