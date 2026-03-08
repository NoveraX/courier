"use client"

import { Check, Copy } from "lucide-react"
import { useCallback, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type ResponseViewerProps = {
  data?: unknown
  status?: number
  error?: string
  className?: string
}

function statusVariant(status: number) {
  if (status >= 200 && status < 300) return "secondary" as const
  if (status >= 400) return "destructive" as const
  return "outline" as const
}

export function ResponseViewer({ data, status, error, className }: ResponseViewerProps) {
  const [copied, setCopied] = useState(false)

  const formatted = data !== undefined ? JSON.stringify(data, null, 2) : null

  const handleCopy = useCallback(async () => {
    if (!formatted) return
    await navigator.clipboard.writeText(formatted)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [formatted])

  if (error) {
    return (
      <div
        className={cn("rounded-lg border border-destructive/30 bg-destructive/5 p-4", className)}
      >
        <p className="text-sm font-medium text-destructive">{error}</p>
      </div>
    )
  }

  if (formatted === null) {
    return (
      <div className={cn("rounded-lg bg-muted p-4 text-sm text-muted-foreground", className)}>
        Run the demo to see the response.
      </div>
    )
  }

  return (
    <div className={cn("group relative rounded-lg bg-muted", className)}>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Response</span>
          {status !== undefined && (
            <Badge variant={statusVariant(status)} className="text-[10px]">
              {status}
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md p-1 opacity-0 transition-opacity hover:bg-background/80 group-hover:opacity-100"
          aria-label="Copy response"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto p-4 text-sm leading-relaxed">
        <code className="font-mono">{formatted}</code>
      </pre>
    </div>
  )
}
