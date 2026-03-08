import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface ProseProps {
  children: ReactNode
  className?: string
}

export function Prose({ children, className }: ProseProps) {
  return (
    <div
      data-slot="prose"
      className={cn(
        "max-w-none",
        "[&>*+*]:mt-5",
        "[&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight",
        "[&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:tracking-tight",
        "[&_h4]:mt-6 [&_h4]:text-lg [&_h4]:font-semibold",
        "[&_p]:text-muted-foreground [&_p]:leading-7",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary/80",
        "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-muted-foreground",
        "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:text-muted-foreground",
        "[&_li]:mt-2 [&_li]:leading-7",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-brand [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
        "[&_hr]:my-8 [&_hr]:border-border",
        className
      )}
    >
      {children}
    </div>
  )
}
