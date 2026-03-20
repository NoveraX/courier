import { motion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Shared stagger item variants — use directly on `motion.button` or other
 * motion elements that can't be wrapped in an extra `<div>`.
 *
 * @example
 * <StaggerList>
 *   {items.map(item => (
 *     <motion.button key={item.id} variants={STAGGER_ITEM_VARIANTS}>
 *       ...
 *     </motion.button>
 *   ))}
 * </StaggerList>
 */
export const STAGGER_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] },
  },
} as const;

interface StaggerListProps {
  children: React.ReactNode;
  className?: string;
  /** Delay between each child in seconds @default 0.03 */
  stagger?: number;
}

/**
 * Container that staggers the entrance of its children.
 * Children must use either `<StaggerItem>` or `variants={STAGGER_ITEM_VARIANTS}`.
 */
export function StaggerList({
  children,
  className,
  stagger = 0.03,
}: StaggerListProps): React.ReactElement {
  return (
    <motion.div
      className={cn(className)}
      variants={{
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: stagger } },
      }}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

/** Wrapper div that picks up the stagger animation from a parent `StaggerList`. */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <motion.div className={cn(className)} variants={STAGGER_ITEM_VARIANTS}>
      {children}
    </motion.div>
  );
}
