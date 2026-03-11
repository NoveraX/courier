import { Play, Send, Loader2, AlertTriangle, WifiOff } from "lucide-react"

import type { EndpointInfo } from "../../store"

import { Badge } from "../../components/ui"
import { Dropdown } from "./dropdown"

export function PlaygroundToolbar({
  connected,
  isUsingDemo,
  sourceNames,
  selectedSource,
  selectedGroup,
  selectedMethod,
  groups,
  methods,
  endpointInfo,
  mode,
  setMode,
  loading,
  canSend,
  onSourceChange,
  onGroupChange,
  onMethodChange,
  onSend,
}: {
  connected: boolean
  isUsingDemo: boolean
  sourceNames: string[]
  selectedSource: string
  selectedGroup: string
  selectedMethod: string
  groups: string[]
  methods: string[]
  endpointInfo: EndpointInfo | null
  mode: "direct" | "proxy"
  setMode: (m: "direct" | "proxy") => void
  loading: boolean
  canSend: boolean
  onSourceChange: (s: string) => void
  onGroupChange: (g: string) => void
  onMethodChange: (m: string) => void
  onSend: () => void
}) {
  return (
    <>
      {!connected && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[11px] text-red-400">
          <WifiOff size={12} />
          Socket not connected — requests will be buffered until reconnection
        </div>
      )}
      {isUsingDemo && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-400">
          <AlertTriangle size={12} />
          No applications connected — showing demo endpoints. Requests will fail until an app connects.
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-border-default bg-surface-0 px-4 py-2">
        <Play size={16} className="shrink-0 text-text-muted" />
        <span className="text-xs font-medium text-text-secondary">Playground</span>

        <div className="ml-2 flex items-center gap-1">
          <Dropdown value={selectedSource} options={sourceNames} onChange={onSourceChange} placeholder="Source" />
          {/* Hide group dropdown for flat APIs (single empty-name group) */}
          {!(groups.length === 1 && groups[0] === "") && (
            <>
              <span className="text-text-muted">.</span>
              <Dropdown value={selectedGroup} options={groups} onChange={onGroupChange} placeholder="Group" />
            </>
          )}
          <span className="text-text-muted">.</span>
          <Dropdown value={selectedMethod} options={methods} onChange={onMethodChange} placeholder="Method" />
        </div>

        {endpointInfo && (
          <Badge variant={endpointInfo.type === "query" ? "emerald" : "amber"}>
            {endpointInfo.type}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-2">
          <ModeToggle mode={mode} setMode={setMode} />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            title="Send request (Cmd+Enter)"
            className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Send
          </button>
        </div>
      </div>
    </>
  )
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: "direct" | "proxy"
  setMode: (m: "direct" | "proxy") => void
}) {
  return (
    <div className="flex rounded-lg bg-surface-1 p-0.5">
      {(["direct", "proxy"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
            mode === m
              ? "bg-surface-2 text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          {m === "direct" ? "Direct" : "Proxy"}
        </button>
      ))}
    </div>
  )
}
