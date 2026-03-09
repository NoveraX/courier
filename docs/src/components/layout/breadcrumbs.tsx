"use client"

import { ChevronRight, Home } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { findNavContext } from "./nav-items"

export function Breadcrumbs() {
  const pathname = usePathname()

  if (pathname === "/") return null

  const context = findNavContext(pathname)
  if (!context) return null

  return (
    <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link href="/" className="flex items-center transition-colors hover:text-foreground">
        <Home className="h-3.5 w-3.5" />
      </Link>
      <ChevronRight className="h-3 w-3" />
      <span>{context.section.label}</span>
      <ChevronRight className="h-3 w-3" />
      <span className="font-medium text-foreground">{context.item.title}</span>
    </nav>
  )
}
