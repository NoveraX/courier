"use client"

import { motion } from "motion/react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface GradientTextProps {
  children: ReactNode
  className?: string
  as?: "h1" | "h2" | "h3" | "span" | "p"
  animate?: boolean
}

export function GradientText({
  children,
  className,
  as: Tag = "span",
  animate = false,
}: GradientTextProps) {
  if (animate) {
    return (
      <motion.span
        data-slot="gradient-text"
        className={cn("gradient-brand-text", className)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {children}
      </motion.span>
    )
  }

  return (
    <Tag data-slot="gradient-text" className={cn("gradient-brand-text", className)}>
      {children}
    </Tag>
  )
}
