import { useState, useCallback, useRef, useEffect } from "react"
import { ChevronRight, Copy, Check } from "lucide-react"

import { PrimitiveValue } from "./json-tree-primitive"

export function JsonNode({
  value,
  path,
  depth,
  keyName,
  defaultExpanded,
  searchQuery,
  isLast = true,
}: {
  value: unknown
  path: string
  depth: number
  keyName?: string
  defaultExpanded: number
  searchQuery?: string
  isLast?: boolean
}) {
  const [expanded, setExpanded] = useState(depth < defaultExpanded)
  const [copied, setCopied] = useState(false)

  const isObject = value !== null && typeof value === "object"
  const isArray = Array.isArray(value)

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const copyPath = useCallback(() => {
    navigator.clipboard.writeText(path)
    setCopied(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 1500)
  }, [path])

  const matchesSearch = searchQuery
    ? (keyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (!isObject && String(value).toLowerCase().includes(searchQuery.toLowerCase())))
    : false

  const copyButton = (stopPropagation?: boolean) => (
    <button
      type="button"
      onClick={(e) => { if (stopPropagation) e.stopPropagation(); copyPath() }}
      className="ml-auto hidden shrink-0 text-text-muted hover:text-text-secondary group-hover:block"
      title={`Copy path: ${path}`}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </button>
  )

  // Primitive values
  if (!isObject) {
    return (
      <div className={`group flex items-start gap-1 hover:bg-surface-1 rounded px-1 -mx-1 ${matchesSearch ? "bg-amber-500/10" : ""}`}>
        {keyName !== undefined && (
          <span className="text-violet-400 shrink-0">
            {JSON.stringify(keyName)}
            <span className="text-text-muted">: </span>
          </span>
        )}
        <PrimitiveValue value={value} searchQuery={searchQuery} />
        {!isLast && <span className="text-text-muted">,</span>}
        {copyButton()}
      </div>
    )
  }

  // Object / Array
  const entries = isArray ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>)
  const bracketOpen = isArray ? "[" : "{"
  const bracketClose = isArray ? "]" : "}"
  const count = entries.length

  if (count === 0) {
    return (
      <div className="flex items-center gap-1">
        {keyName !== undefined && (
          <span className="text-violet-400">
            {JSON.stringify(keyName)}
            <span className="text-text-muted">: </span>
          </span>
        )}
        <span className="text-text-muted">{bracketOpen}{bracketClose}</span>
        {!isLast && <span className="text-text-muted">,</span>}
      </div>
    )
  }

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-0.5 hover:bg-surface-1 rounded px-1 -mx-1 ${matchesSearch ? "bg-amber-500/10" : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-text-muted transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        {keyName !== undefined && (
          <span className="text-violet-400">
            {JSON.stringify(keyName)}
            <span className="text-text-muted">: </span>
          </span>
        )}
        {!expanded && (
          <span className="text-text-muted">
            {bracketOpen}<span className="text-text-secondary">{count} {isArray ? (count === 1 ? "item" : "items") : (count === 1 ? "key" : "keys")}</span>{bracketClose}
            {!isLast && ","}
          </span>
        )}
        {expanded && <span className="text-text-muted">{bracketOpen}</span>}
        {copyButton(true)}
      </div>
      {expanded && (
        <>
          <div className="ml-4 border-l border-border-subtle pl-1">
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
              />
            ))}
          </div>
          <div className="flex items-center gap-1 px-1 -mx-1">
            <span className="text-text-muted">{bracketClose}</span>
            {!isLast && <span className="text-text-muted">,</span>}
          </div>
        </>
      )}
    </div>
  )
}
