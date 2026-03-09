import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface IconBadgeProps {
  icon: LucideIcon
  className?: string
  variant?: "brand" | "success" | "warning" | "destructive" | "info" | "muted"
  size?: "sm" | "md" | "lg"
}

const variantStyles = {
  brand: "bg-brand/10 text-brand dark:bg-brand/15",
  success: "bg-success/10 text-success dark:bg-success/15",
  warning: "bg-warning/10 text-warning dark:bg-warning/15",
  destructive: "bg-destructive/10 text-destructive dark:bg-destructive/15",
  info: "bg-info/10 text-info dark:bg-info/15",
  muted: "bg-muted text-muted-foreground",
}

const sizeStyles = {
  sm: "h-8 w-8 [&_svg]:h-4 [&_svg]:w-4",
  md: "h-10 w-10 [&_svg]:h-5 [&_svg]:w-5",
  lg: "h-12 w-12 [&_svg]:h-6 [&_svg]:w-6",
}

export function IconBadge({
  icon: Icon,
  className,
  variant = "brand",
  size = "md",
}: IconBadgeProps) {
  return (
    <div
      data-slot="icon-badge"
      className={cn(
        "inline-flex items-center justify-center rounded-lg",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      <Icon />
    </div>
  )
}
