"use client"

import { Check, Copy } from "lucide-react"
import { useCallback, useState } from "react"

import { cn } from "@/lib/utils"

type CopyButtonProps = {
  code: string
  className?: string
}

export function CopyButton({ code, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [code])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "absolute top-2 right-2 z-10 rounded-md border border-white/10 bg-white/5 p-1.5",
        "opacity-0 backdrop-blur-sm transition-opacity hover:bg-white/10 group-hover:opacity-100",
        className
      )}
      aria-label="Copy code"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-zinc-400" />
      )}
    </button>
  )
}
