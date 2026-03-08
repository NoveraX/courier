import { cn } from "@/lib/utils"

type InlineCodeProps = {
  children: React.ReactNode
  className?: string
}

export function InlineCode({ children, className }: InlineCodeProps) {
  return (
    <code
      data-slot="inline-code"
      className={cn(
        "rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.875em]",
        className
      )}
    >
      {children}
    </code>
  )
}
