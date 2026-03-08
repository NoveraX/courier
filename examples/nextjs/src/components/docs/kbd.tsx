import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface KbdProps {
  children: ReactNode
  className?: string
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground",
        className
      )}
    >
      {children}
    </kbd>
  )
}
