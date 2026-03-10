import { useState, useCallback } from "react"
import { X, Copy } from "lucide-react"

import type { RequestEntry } from "../../store"

import { STATUS_CONFIG, getCodeColor } from "./constants"
import { buildCurl, getRequestLabel } from "./request-helpers"
import { GeneralTab } from "./tabs/general-tab"
import { HeadersTab } from "./tabs/headers-tab"
import { PayloadTab } from "./tabs/payload-tab"
import { ResponseTab } from "./tabs/response-tab"
import { TimingTab } from "./tabs/timing-tab"
import { ProxyTab } from "./tabs/proxy-tab"
import { ErrorTab } from "./tabs/error-tab"

// ── Detail Tab IDs ───────────────────────────────────────────────────────────

type DetailTab = "general" | "headers" | "payload" | "response" | "timing" | "proxy" | "error"

const DETAIL_TABS: { id: DetailTab; label: string; show: (r: RequestEntry) => boolean }[] = [
  { id: "general", label: "General", show: () => true },
  { id: "headers", label: "Headers", show: () => true },
  { id: "payload", label: "Payload", show: (r) => r.variables !== undefined },
  { id: "response", label: "Response", show: (r) => r.data !== undefined },
  { id: "timing", label: "Timing", show: (r) => !!r.timing },
  { id: "proxy", label: "Proxy", show: (r) => r.mode === "proxy" },
  { id: "error", label: "Error", show: (r) => !!r.error },
]

// ── Detail Panel ─────────────────────────────────────────────────────────────

export function DetailPanel({
  request,
  onClose,
}: {
  request: RequestEntry
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>("general")
  const label = getRequestLabel(request)
  const statusCfg = STATUS_CONFIG[request.status]

  const visibleTabs = DETAIL_TABS.filter((t) => t.show(request))
  const currentTab = visibleTabs.find((t) => t.id === activeTab) ? activeTab : "general"

  const copyAsCurl = useCallback(() => {
    navigator.clipboard.writeText(buildCurl(request))
  }, [request])

  return (
    <div className="flex w-110 shrink-0 flex-col overflow-hidden border-l border-border-default">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-border-subtle px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={`h-2 w-2 shrink-0 rounded-full ${statusCfg.dotClass}`} />
          <span className="truncate font-mono text-xs text-text-secondary">{label}</span>
          {request.statusCode != null && (
            <span
              className={`text-xs font-medium ${getCodeColor(request.statusCode)}`}
            >
              {request.statusCode}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copyAsCurl}
            title="Copy as cURL"
            className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text-secondary"
          >
            <Copy size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex h-8 shrink-0 items-center gap-0 overflow-x-auto border-b border-border-subtle px-1">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-t px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              currentTab === tab.id
                ? "bg-surface-1 text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-3 text-xs">
        {currentTab === "general" && <GeneralTab request={request} />}
        {currentTab === "headers" && <HeadersTab request={request} />}
        {currentTab === "payload" && <PayloadTab request={request} />}
        {currentTab === "response" && <ResponseTab request={request} />}
        {currentTab === "timing" && <TimingTab request={request} />}
        {currentTab === "proxy" && <ProxyTab request={request} />}
        {currentTab === "error" && <ErrorTab request={request} />}
      </div>
    </div>
  )
}
