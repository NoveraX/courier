import { AlertCircle, AlertTriangle, Info, Lightbulb } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type CalloutVariant = "info" | "warning" | "error" | "tip"

interface CalloutProps {
  children: ReactNode
  variant?: CalloutVariant
  title?: string
  className?: string
}

const config: Record<CalloutVariant, { icon: typeof Info; styles: string; titleColor: string }> = {
  info: {
    icon: Info,
    styles: "border-info/30 bg-info/5 dark:border-info/20 dark:bg-info/5",
    titleColor: "text-info",
  },
  warning: {
    icon: AlertTriangle,
    styles: "border-warning/30 bg-warning/5 dark:border-warning/20 dark:bg-warning/5",
    titleColor: "text-warning",
  },
  error: {
    icon: AlertCircle,
    styles:
      "border-destructive/30 bg-destructive/5 dark:border-destructive/20 dark:bg-destructive/5",
    titleColor: "text-destructive",
  },
  tip: {
    icon: Lightbulb,
    styles: "border-success/30 bg-success/5 dark:border-success/20 dark:bg-success/5",
    titleColor: "text-success",
  },
}

export function Callout({ children, variant = "info", title, className }: CalloutProps) {
  const { icon: Icon, styles, titleColor } = config[variant]

  return (
    <div data-slot="callout" className={cn("rounded-lg border p-4", styles, className)}>
      <div className="flex gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", titleColor)} />
        <div className="min-w-0 flex-1">
          {title && <p className={cn("mb-1 text-sm font-semibold", titleColor)}>{title}</p>}
          <div className="text-sm text-muted-foreground [&_p]:leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  )
}
