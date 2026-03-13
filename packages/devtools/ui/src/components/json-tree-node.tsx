import { useState, useCallback, useRef, useEffect } from "react"
import { ChevronRight, Copy, Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { PrimitiveValue } from "./json-tree-primitive"

export function JsonNode({
  value, path, depth, keyName, defaultExpanded, searchQuery, isLast = true, onPathSelect,
}: {
  value: unknown
  path: string
  depth: number
  keyName?: string
  defaultExpanded: number
  searchQuery?: string
  isLast?: boolean
  onPathSelect?: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(depth < defaultExpanded)
  const [copied, setCopied] = useState(false)

  const isObject = value !== null && typeof value === "object"
  const isArray = Array.isArray(value)

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const copyPath = useCallback(() => {
    navigator.clipboard.writeText(path)
    onPathSelect?.(path)
    setCopied(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 1500)
  }, [path, onPathSelect])

  const matchesSearch = searchQuery
    ? (keyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (!isObject && String(value).toLowerCase().includes(searchQuery.toLowerCase())))
    : false

  // Primitive values
  if (!isObject) {
    return (
      <div className={cn(
        "group -mx-1 flex items-start gap-1 rounded px-1 hover:bg-accent/50",
        matchesSearch && "bg-amber-500/10",
      )}>
        <KeyLabel keyName={keyName} />
        <PrimitiveValue value={value} searchQuery={searchQuery} />
        {!isLast && <Comma />}
        <CopyPathButton copied={copied} onCopy={copyPath} path={path} />
      </div>
    )
  }

  // Object / Array
  const entries = isArray
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>)
  const bracketOpen = isArray ? "[" : "{"
  const bracketClose = isArray ? "]" : "}"
  const count = entries.length

  if (count === 0) {
    return (
      <div className="flex items-center gap-1">
        <KeyLabel keyName={keyName} />
        <span className="text-muted-foreground">{bracketOpen}{bracketClose}</span>
        {!isLast && <Comma />}
      </div>
    )
  }

  return (
    <div>
      <div
        className={cn(
          "group -mx-1 flex cursor-pointer items-center gap-0.5 rounded px-1 hover:bg-accent/50",
          matchesSearch && "bg-amber-500/10",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight className={cn(
          "size-3 shrink-0 text-muted-foreground transition-transform duration-150",
          expanded && "rotate-90",
        )} />
        <KeyLabel keyName={keyName} />
        {!expanded && (
          <span className="text-muted-foreground">
            {bracketOpen}
            <span className="text-foreground/60">{count} {isArray ? (count === 1 ? "item" : "items") : (count === 1 ? "key" : "keys")}</span>
            {bracketClose}
            {!isLast && ","}
          </span>
        )}
        {expanded && <span className="text-muted-foreground">{bracketOpen}</span>}
        <CopyPathButton copied={copied} onCopy={(e) => { e.stopPropagation(); copyPath() }} path={path} />
      </div>
      {expanded && (
        <>
          <div className="ml-4 border-l border-border pl-1">
            {entries.map(([key, val], i) => (
              <JsonNode
                key={key}
                keyName={isArray ? undefined : key}
                value={val}
                path={path ? (isArray ? `${path}[${key}]` : `${path}.${key}`) : key}
                depth={depth + 1}
                defaultExpanded={defaultExpanded}
                searchQuery={searchQuery}
                isLast={i === count - 1}
                onPathSelect={onPathSelect}
              />
            ))}
          </div>
          <div className="-mx-1 flex items-center gap-1 px-1">
            <span className="text-muted-foreground">{bracketClose}</span>
            {!isLast && <Comma />}
          </div>
        </>
      )}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function KeyLabel({ keyName }: { keyName?: string }) {
  if (keyName === undefined) return null
  return (
    <span className="shrink-0 text-violet-400">
      {JSON.stringify(keyName)}
      <span className="text-muted-foreground">: </span>
    </span>
  )
}

function Comma() {
  return <span className="text-muted-foreground">,</span>
}

function CopyPathButton({ copied, onCopy, path }: {
  copied: boolean
  onCopy: ((e: React.MouseEvent) => void) | (() => void)
  path: string
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="ml-auto hidden shrink-0 text-muted-foreground hover:text-foreground group-hover:block"
      title={`Copy path: ${path}`}
    >
      {copied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
    </button>
  )
}
