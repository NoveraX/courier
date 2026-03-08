import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

type PageHeaderProps = {
  title: string
  description?: string
  badge?: string
  children?: ReactNode
}

export function PageHeader({ title, description, badge, children }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {badge && (
          <Badge variant="secondary" className="text-xs">
            {badge}
          </Badge>
        )}
      </div>
      {description && (
        <p className="text-lg leading-relaxed text-muted-foreground">{description}</p>
      )}
      {children}
      <Separator className="mt-6" />
    </div>
  )
}
