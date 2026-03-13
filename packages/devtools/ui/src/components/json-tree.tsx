import { useState, useCallback } from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { JsonNode } from "./json-tree-node"

interface JsonTreeProps {
  data: unknown
  searchQuery?: string
  defaultExpanded?: number
}

export function JsonTree({ data, searchQuery, defaultExpanded = 2 }: JsonTreeProps) {
  const [activePath, setActivePath] = useState("")

  const handlePathSelect = useCallback((path: string) => {
    setActivePath(path)
  }, [])

  if (data === undefined || data === null) {
    return <span className="italic text-muted-foreground">null</span>
  }

  return (
    <div className="font-mono text-[11px] leading-relaxed">
      {activePath && <PathBreadcrumb path={activePath} onNavigate={handlePathSelect} />}
      <JsonNode
        value={data}
        path=""
        depth={0}
        defaultExpanded={defaultExpanded}
        searchQuery={searchQuery}
        onPathSelect={handlePathSelect}
      />
    </div>
  )
}

// ── Path Breadcrumb ─────────────────────────────────────────────────────────

/** Parses "user.addresses[0].city" → ["root", "user", "addresses", "[0]", "city"] */
function parsePathSegments(path: string): { label: string; path: string }[] {
  const segments: { label: string; path: string }[] = [{ label: "root", path: "" }]
  if (!path) return segments

  let current = ""
  let i = 0

  while (i < path.length) {
    if (path[i] === "[") {
      // Flush accumulated key
      if (current) {
        const fullPath = segments.length === 1 ? current : `${segments.at(-1)!.path}.${current}`
        segments.push({ label: current, path: fullPath })
        current = ""
      }
      // Read array index
      const end = path.indexOf("]", i)
      if (end === -1) break
      const index = path.slice(i, end + 1)
      segments.push({ label: index, path: `${segments.at(-1)!.path}${index}` })
      i = end + 1
      if (path[i] === ".") i++ // skip dot after bracket
    } else if (path[i] === ".") {
      if (current) {
        const fullPath = segments.length === 1 ? current : `${segments.at(-1)!.path}.${current}`
        segments.push({ label: current, path: fullPath })
        current = ""
      }
      i++
    } else {
      current += path[i]
      i++
    }
  }

  // Flush remaining
  if (current) {
    const fullPath = segments.length === 1 ? current : `${segments.at(-1)!.path}.${current}`
    segments.push({ label: current, path: fullPath })
  }

  return segments
}

function PathBreadcrumb({
  path, onNavigate,
}: {
  path: string
  onNavigate: (path: string) => void
}) {
  const segments = parsePathSegments(path)

  return (
    <nav className="mb-1.5 flex items-center gap-0.5 text-[10px]">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1
        return (
          <span key={seg.path} className="flex items-center gap-0.5">
            {i > 0 && <ChevronRight className="size-2.5 text-muted-foreground/50" />}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(seg.path || "root")
                onNavigate(seg.path)
              }}
              className={cn(
                "rounded px-1 py-0.5 transition-colors",
                isLast
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {seg.label}
            </button>
          </span>
        )
      })}
    </nav>
  )
}
