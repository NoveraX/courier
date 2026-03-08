"use client"

import type { LucideIcon } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"

import { cn } from "@/lib/utils"

import { IconBadge } from "./icon-badge"

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
  href?: string
  className?: string
  index?: number
}

export function FeatureCard({
  icon,
  title,
  description,
  href,
  className,
  index = 0,
}: FeatureCardProps) {
  const content = (
    <motion.div
      data-slot="feature-card"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
      className={cn(
        "group relative rounded-xl border bg-card p-5 transition-all duration-200",
        "hover:border-brand/30 hover:shadow-md",
        "dark:hover:border-brand/20 dark:hover:shadow-brand/5",
        className
      )}
    >
      <IconBadge icon={icon} className="mb-3" />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
      {href && (
        <span className="mt-3 inline-flex items-center text-sm font-medium text-brand transition-colors group-hover:text-brand-hover">
          Learn more
          <svg
            aria-hidden="true"
            className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      )}
    </motion.div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
