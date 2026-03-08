"use client"

import { Check, Copy } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { cn } from "@/lib/utils"

type ResponseViewerProps = {
  data?: unknown
  status?: number
  error?: string
  responseTime?: number
  className?: string
}

function statusColor(status: number) {
  if (status >= 200 && status < 300) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
  if (status >= 400 && status < 500) return "bg-amber-500/10 text-amber-400 border-amber-500/20"
  return "bg-red-500/10 text-red-400 border-red-500/20"
}

function JsonValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const indent = "  ".repeat(depth)
  const childIndent = "  ".repeat(depth + 1)

  if (value === null) return <span className="text-violet-400">null</span>
  if (value === undefined) return <span className="text-zinc-500">undefined</span>

  if (typeof value === "boolean") {
    return <span className="text-violet-400">{String(value)}</span>
  }

  if (typeof value === "number") {
    return <span className="text-amber-300">{value}</span>
  }

  if (typeof value === "string") {
    return (
      <span className="text-emerald-400">
        &quot;{value}&quot;
      </span>
    )
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-zinc-500">[]</span>
    return (
      <>
        <span className="text-zinc-500">[</span>
        {"\n"}
        {value.map((item, i) => (
          <span key={i}>
            {childIndent}
            <JsonValue value={item} depth={depth + 1} />
            {i < value.length - 1 && <span className="text-zinc-600">,</span>}
            {"\n"}
          </span>
        ))}
        {indent}
        <span className="text-zinc-500">]</span>
      </>
    )
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span className="text-zinc-500">{"{}"}</span>
    return (
      <>
        <span className="text-zinc-500">{"{"}</span>
        {"\n"}
        {entries.map(([key, val], i) => (
          <span key={key}>
            {childIndent}
            <span className="text-sky-300">&quot;{key}&quot;</span>
            <span className="text-zinc-500">: </span>
            <JsonValue value={val} depth={depth + 1} />
            {i < entries.length - 1 && <span className="text-zinc-600">,</span>}
            {"\n"}
          </span>
        ))}
        {indent}
        <span className="text-zinc-500">{"}"}</span>
      </>
    )
  }

  return <span className="text-zinc-400">{String(value)}</span>
}

export function ResponseViewer({
  data,
  status,
  error,
  responseTime,
  className,
}: ResponseViewerProps) {
  const [copied, setCopied] = useState(false)

  const formatted = useMemo(
    () => (data !== undefined ? JSON.stringify(data, null, 2) : null),
    [data]
  )

  const handleCopy = useCallback(async () => {
    if (!formatted) return
    await navigator.clipboard.writeText(formatted)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [formatted])

  if (error) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-red-500/20 bg-red-500/5",
          className
        )}
      >
        <div className="flex items-center gap-2 border-b border-red-500/10 px-4 py-2">
          <span className="inline-flex items-center rounded-md border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
            Error
          </span>
        </div>
        <div className="p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  if (data === undefined) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border/50 bg-muted/30 p-6 text-center",
          className
        )}
      >
        <p className="text-sm text-muted-foreground">Run the demo to see the response</p>
      </div>
    )
  }

  return (
    <div
      data-slot="response-viewer"
      className={cn(
        "group overflow-hidden rounded-lg border border-code-border bg-code-bg",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-400">Response</span>
          {status !== undefined && (
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                statusColor(status)
              )}
            >
              {status}
            </span>
          )}
          {responseTime !== undefined && (
            <span className="text-[10px] text-zinc-500">{responseTime}ms</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md p-1 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"
          aria-label="Copy response"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-zinc-400" />
          )}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto p-4 font-mono text-[13px] leading-relaxed">
        <JsonValue value={data} />
      </pre>
    </div>
  )
}
