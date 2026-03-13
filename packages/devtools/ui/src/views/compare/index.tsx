import { useMemo, useCallback } from "react"
import { getRouteApi } from "@tanstack/react-router"
import { ArrowLeftRight, X } from "lucide-react"

import type { CompareTab } from "../../store"
import { useDevToolsStore } from "../../store"
import { DisconnectedBanner } from "../../components/ui"

import { RequestTag, RequestPicker, ComparePanel } from "./compare-components"

// ── Constants ───────────────────────────────────────────────────────────────

const COMPARE_TABS: { id: CompareTab; label: string }[] = [
  { id: "payload", label: "Payload" },
  { id: "response", label: "Response" },
  { id: "headers", label: "Headers" },
  { id: "timing", label: "Timing" },
]

const routeApi = getRouteApi("/compare")

// ── Compare View ────────────────────────────────────────────────────────────

export function CompareView() {
  const { requests, connected, comparePickerSide: pickerSide, setComparePickerSide: setPickerSide } =
    useDevToolsStore()

  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()

  const leftId = search.left ?? null
  const rightId = search.right ?? null
  const activeTab: CompareTab = search.tab ?? "response"

  const setLeftId = useCallback(
    (id: string) => { void navigate({ search: (prev) => ({ ...prev, left: id }) }) },
    [navigate],
  )
  const setRightId = useCallback(
    (id: string) => { void navigate({ search: (prev) => ({ ...prev, right: id }) }) },
    [navigate],
  )
  const setActiveTab = useCallback(
    (tab: CompareTab) => { void navigate({ search: (prev) => ({ ...prev, tab }) }) },
    [navigate],
  )
  const clearCompareSelection = useCallback(
    () => { void navigate({ search: {} }); setPickerSide(null) },
    [navigate, setPickerSide],
  )

  const completed = useMemo(
    () => requests.filter((r) => r.status !== "pending"),
    [requests],
  )

  const leftReq = useMemo(() => completed.find((r) => r.id === leftId) ?? null, [completed, leftId])
  const rightReq = useMemo(() => completed.find((r) => r.id === rightId) ?? null, [completed, rightId])

  function handleSelect(id: string) {
    if (pickerSide === "left") setLeftId(id)
    else if (pickerSide === "right") setRightId(id)
    setPickerSide(null)
  }

  // If neither selected, show picker for both
  if (!leftReq && !rightReq) {
    return (
      <div className="flex flex-1 flex-col">
        {!connected && <DisconnectedBanner />}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-muted">
          <ArrowLeftRight size={36} strokeWidth={1} />
          <p className="text-sm">Select two requests to compare</p>
          <p className="text-xs">Pick from the list below</p>
        </div>
        <RequestPicker requests={completed} onSelect={(id) => { setLeftId(id); setPickerSide("right") }} selectedIds={[]} />
      </div>
    )
  }

  if (leftReq && !rightReq) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border-default px-3 py-2">
          <RequestTag request={leftReq} />
          <span className="text-text-muted">vs</span>
          <span className="text-[11px] text-text-muted">Select second request...</span>
        </div>
        <RequestPicker requests={completed} onSelect={(id) => setRightId(id)} selectedIds={[leftId!]} />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {!connected && <DisconnectedBanner />}
      {/* Header with selections */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-default px-3 py-1.5">
        <div className="flex items-center gap-2">
          {/* Left slot */}
          <button type="button" onClick={() => setPickerSide(pickerSide === "left" ? null : "left")} className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-1">
            {leftReq ? <RequestTag request={leftReq} /> : <span className="text-[11px] text-text-muted">Select...</span>}
          </button>

          <ArrowLeftRight size={14} className="text-text-muted" />

          {/* Right slot */}
          <button type="button" onClick={() => setPickerSide(pickerSide === "right" ? null : "right")} className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-1">
            {rightReq ? <RequestTag request={rightReq} /> : <span className="text-[11px] text-text-muted">Select...</span>}
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-1 p-0.5">
          {COMPARE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                activeTab === tab.id ? "bg-surface-2 text-text-primary" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Clear */}
        <button type="button" onClick={clearCompareSelection} className="rounded p-1 text-text-muted hover:bg-surface-1 hover:text-text-secondary">
          <X size={14} />
        </button>
      </div>

      {/* Picker dropdown */}
      {pickerSide && (
        <RequestPicker
          requests={completed}
          onSelect={handleSelect}
          selectedIds={[leftId, rightId].filter(Boolean) as string[]}
        />
      )}

      {/* Comparison content */}
      {leftReq && rightReq && !pickerSide && (
        <div className="flex flex-1 overflow-hidden">
          <ComparePanel left={leftReq} right={rightReq} tab={activeTab} />
        </div>
      )}
    </div>
  )
}
