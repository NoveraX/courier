import { motion } from "motion/react";

import { cn } from "@/lib/utils";

const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03 },
  },
} as const;

const ITEM_VARIANTS = {
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
}

/**
 * Wraps a list of items with staggered fade-in + slide-up animation.
 * Each direct child animates in sequence with 30ms delay between items.
 */
export function StaggerList({ children, className }: StaggerListProps): React.ReactElement {
  return (
    <motion.div
      className={cn(className)}
      variants={CONTAINER_VARIANTS}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

/** Wrap each list item with this to pick up the stagger animation. */
export function StaggerItem({
  children,
  className,
}: StaggerListProps): React.ReactElement {
  return (
    <motion.div className={cn(className)} variants={ITEM_VARIANTS}>
      {children}
    </motion.div>
  );
}
