import type { ReactNode } from "react"

import { ModeBadge } from "@/components/docs/mode-badge"
import { Separator } from "@/components/ui/separator"

type PageHeaderProps = {
  title: string
  description?: string
  mode?: "direct" | "proxy" | "both"
  children?: ReactNode
}

export function PageHeader({ title, description, mode, children }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {mode && <ModeBadge mode={mode} />}
      </div>
      {description && (
        <p className="text-lg leading-relaxed text-muted-foreground">{description}</p>
      )}
      {children}
      <Separator className="mt-6" />
    </div>
  )
}
