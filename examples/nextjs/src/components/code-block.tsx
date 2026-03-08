"use client"

import { Check, Copy } from "lucide-react"
import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"

type CodeBlockProps = {
  code: string
  language?: string
  className?: string
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [code])

  return (
    <div className={cn("group relative", className)}>
      {language && (
        <div className="absolute top-2 left-3 text-[10px] uppercase tracking-wider text-muted-foreground/60">
          {language}
        </div>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 rounded-md border bg-background/80 p-1.5 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}
