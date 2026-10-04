import { motion } from "motion/react";

import { revealAfter } from "./motion";

interface RevealProps {
  /** The part's place in the order its surface opens in, from 0. */
  step: number;
  /** Whether the part arrives with its surface; a part shown again appears at once. */
  play: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * A part of a surface that follows the surface in as it opens, rising a
 * few pixels into place after the parts before it. Once the surface is
 * open, a part drawn again — another request, another tab — appears at
 * once, so moving through items never waits on a choreography.
 *
 * @param props - The part's place, whether it plays, and its content
 * @returns The part
 * @example
 * ```tsx
 * <Reveal step={1} play={opening}>
 *   <StatCellGrid cells={cells} />
 * </Reveal>
 * ```
 */
export function Reveal({ step, play, className, children }: RevealProps): React.ReactNode {
  return (
    <motion.div
      className={className}
      initial={play ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={revealAfter(step)}
    >
      {children}
    </motion.div>
  );
}
