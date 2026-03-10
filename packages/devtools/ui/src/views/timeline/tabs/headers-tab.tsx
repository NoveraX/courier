import { useState } from "react"
import { Search, X } from "lucide-react"

import type { RequestEntry } from "../../../store"

import { Section, CopyButton, Badge } from "../../../components/ui"

// ── Headers Tab ──────────────────────────────────────────────────────────────
// Two-column layout, search, per-header copy, middleware badges

export function HeadersTab({ request }: { request: RequestEntry }) {
  const [search, setSearch] = useState("")
  const query = search.toLowerCase()

  const reqHeaders = request.requestHeaders
    ? filterHeaders(Object.entries(request.requestHeaders), query)
    : []
  const resHeaders = request.headers
    ? filterHeaders(Object.entries(request.headers), query)
    : []

  const hasAny = reqHeaders.length > 0 || resHeaders.length > 0
  const noHeaders = !request.requestHeaders && !request.headers

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Filter headers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 w-full rounded bg-surface-1 pl-7 pr-7 text-[11px] text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-indigo-500/50"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
          >
            <X size={10} />
          </button>
        )}
      </div>

      {noHeaders && <p className="text-[11px] italic text-text-muted">No headers captured</p>}

      {!noHeaders && !hasAny && search && (
        <p className="text-[11px] italic text-text-muted">No headers match &quot;{search}&quot;</p>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Request Headers */}
        {request.requestHeaders && Object.keys(request.requestHeaders).length > 0 && (
          <Section title="Request Headers">
            <div className="space-y-0.5">
              {reqHeaders.map(([key, value]) => (
                <HeaderRow
                  key={key}
                  headerKey={key}
                  headerValue={value}
                  middlewareSource={getMiddlewareSource(
                    key,
                    request.middlewareHeaders,
                  )}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Response Headers */}
        {request.headers && Object.keys(request.headers).length > 0 && (
          <Section title="Response Headers">
            <div className="space-y-0.5">
              {resHeaders.map(([key, value]) => (
                <HeaderRow key={key} headerKey={key} headerValue={value} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

// ── Header Row with copy + middleware badge ───────────────────────────────────

function HeaderRow({
  headerKey,
  headerValue,
  middlewareSource,
}: {
  headerKey: string
  headerValue: string
  middlewareSource?: string[]
}) {
  return (
    <div className="group flex items-start gap-2 rounded px-1.5 py-1 hover:bg-surface-1">
      <span className="shrink-0 font-mono text-[11px] text-violet-400">{headerKey}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-text-secondary">
        {headerValue}
      </span>
      {middlewareSource && middlewareSource.length > 0 && (
        <div className="flex shrink-0 gap-0.5">
          {middlewareSource.map((mw) => (
            <Badge key={mw} variant="violet">
              {mw}
            </Badge>
          ))}
        </div>
      )}
      <CopyButton text={`${headerKey}: ${headerValue}`} size={10} className="hidden group-hover:block" />
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function filterHeaders(
  headers: [string, string][],
  query: string,
): [string, string][] {
  if (!query) return headers
  return headers.filter(
    ([k, v]) =>
      k.toLowerCase().includes(query) || v.toLowerCase().includes(query),
  )
}

function getMiddlewareSource(
  headerKey: string,
  middlewareHeaders?: Record<string, string[]>,
): string[] | undefined {
  if (!middlewareHeaders) return undefined
  return middlewareHeaders[headerKey.toLowerCase()]
}
