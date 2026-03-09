"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function ContentWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isExamples = pathname.startsWith("/docs/examples")

  return (
    <div className={cn("animate-page-in mx-auto", isExamples ? "max-w-5xl" : "max-w-3xl")}>
      {children}
    </div>
  )
}
