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
        "[&_a:not(:where(h2,h3,h4)_a)]:font-medium [&_a:not(:where(h2,h3,h4)_a)]:text-primary [&_a:not(:where(h2,h3,h4)_a)]:underline [&_a:not(:where(h2,h3,h4)_a)]:underline-offset-4 hover:[&_a:not(:where(h2,h3,h4)_a)]:text-primary/80",
        "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-muted-foreground",
        "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:text-muted-foreground",
        "[&_li]:mt-2 [&_li]:leading-7",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-brand [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
        "[&_hr]:my-8 [&_hr]:border-border",
        "[&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-lg [&_table]:border [&_table]:border-border [&_table]:text-sm",
        "[&_thead]:bg-muted/50",
        "[&_th]:border-b [&_th]:border-border [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground",
        "[&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-2.5 [&_td]:text-muted-foreground",
        "[&_tr:last-child_td]:border-b-0",
        "[&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:border [&_:not(pre)>code]:border-border [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.875em]",
        className
      )}
    >
      {children}
    </div>
  )
}
