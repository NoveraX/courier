"use client"

import { Check, Copy } from "lucide-react"
import { useCallback, useState } from "react"

export function InstallBadge() {
  const [copied, setCopied] = useState(false)
  const command = "npm install @noverax/nexus"

  const copy = useCallback(() => {
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [command])

  return (
    <button
      type="button"
      onClick={copy}
      className="group inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-surface px-4 py-2 font-mono text-sm transition-all hover:border-brand/40 hover:bg-elevated"
    >
      <span className="text-muted-foreground">$</span>
      <span>{command}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
      )}
    </button>
  )
}
