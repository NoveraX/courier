"use client"

import { ArrowLeft, ArrowRight } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { flatNavItems } from "./nav-items"

export function DocsPagination() {
  const pathname = usePathname()
  const items = flatNavItems()
  const currentIndex = items.findIndex((item) => item.href === pathname)

  if (currentIndex === -1) return null

  const prev = currentIndex > 0 ? items[currentIndex - 1] : null
  const next = currentIndex < items.length - 1 ? items[currentIndex + 1] : null

  if (!prev && !next) return null

  return (
    <nav className="mt-12 flex items-stretch gap-4 border-t pt-6">
      {prev ? (
        <Link
          href={prev.href}
          className={cn(
            "group flex flex-1 flex-col items-start gap-1 rounded-lg border p-4",
            "text-muted-foreground transition-colors hover:border-brand/30 hover:bg-brand/5"
          )}
        >
          <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider">
            <ArrowLeft className="h-3 w-3" />
            Previous
          </span>
          <span className="text-sm font-medium text-foreground transition-colors group-hover:text-brand">
            {prev.title}
          </span>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <Link
          href={next.href}
          className={cn(
            "group flex flex-1 flex-col items-end gap-1 rounded-lg border p-4",
            "text-muted-foreground transition-colors hover:border-brand/30 hover:bg-brand/5"
          )}
        >
          <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider">
            Next
            <ArrowRight className="h-3 w-3" />
          </span>
          <span className="text-sm font-medium text-foreground transition-colors group-hover:text-brand">
            {next.title}
          </span>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </nav>
  )
}
