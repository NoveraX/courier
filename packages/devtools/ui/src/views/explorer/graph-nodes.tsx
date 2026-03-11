import type { NodeTypes } from "@xyflow/react"
import { Handle, Position } from "@xyflow/react"
import { Database, Folder, Zap, Shield, CheckCircle, XCircle } from "lucide-react"

import type { GraphLayout } from "../../store"
import { Badge } from "../../components/ui"

// ── Handle position helpers ─────────────────────────────────────────────────

function sourcePos(layout: GraphLayout): Position {
  return layout === "LR" ? Position.Right : Position.Bottom
}

function targetPos(layout: GraphLayout): Position {
  return layout === "LR" ? Position.Left : Position.Top
}

// ── Custom node components ──────────────────────────────────────────────────

function SourceNode({
  data,
}: {
  data: { label: string; baseURL: string; groupCount: number; layout: GraphLayout }
}) {
  return (
    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 shadow-lg backdrop-blur-sm">
      <Handle type="source" position={sourcePos(data.layout)} className="!bg-indigo-400 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Database size={14} className="text-indigo-400" />
        <span className="text-xs font-semibold text-indigo-300">{data.label}</span>
      </div>
      <div className="mt-1 text-[10px] text-text-muted">{data.baseURL}</div>
      <div className="mt-1 text-[10px] text-text-muted">{data.groupCount} groups</div>
    </div>
  )
}

function GroupNode({
  data,
}: {
  data: { label: string; prefix: string; endpointCount: number; layout: GraphLayout }
}) {
  return (
    <div className="rounded-lg border border-zinc-600/50 bg-surface-2 px-4 py-3 shadow-lg">
      <Handle type="target" position={targetPos(data.layout)} className="!bg-zinc-400 !w-2 !h-2" />
      <Handle type="source" position={sourcePos(data.layout)} className="!bg-zinc-400 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Folder size={14} className="text-zinc-400" />
        <span className="text-xs font-semibold text-text-primary">{data.label}</span>
      </div>
      <div className="mt-1 text-[10px] text-text-muted">{data.prefix}</div>
      <div className="mt-1 text-[10px] text-text-muted">{data.endpointCount} endpoints</div>
    </div>
  )
}

const HTTP_METHOD_MAP: Record<string, string> = {
  query: "GET",
  mutation: "POST",
}

function EndpointNode({
  data,
}: {
  data: {
    label: string
    type: "query" | "mutation"
    hasVariablesSchema: boolean
    hasResponseSchema: boolean
    middleware: string[]
    source: string
    group: string
    showSchemas: boolean
    layout: GraphLayout
  }
}) {
  const isQuery = data.type === "query"

  return (
    <div
      className={`rounded-lg border px-3 py-2 shadow-lg ${
        isQuery
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-orange-500/30 bg-orange-500/10"
      }`}
    >
      <Handle
        type="target"
        position={targetPos(data.layout)}
        className={`!w-2 !h-2 ${isQuery ? "!bg-emerald-400" : "!bg-orange-400"}`}
      />
      <div className="flex items-center gap-2">
        <Zap size={12} className={isQuery ? "text-emerald-400" : "text-orange-400"} />
        <span className="text-xs font-medium text-text-primary">{data.label}</span>
        <Badge variant={isQuery ? "emerald" : "orange"}>
          {HTTP_METHOD_MAP[data.type] ?? data.type}
        </Badge>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {data.middleware && data.middleware.length > 0 && (
          <div className="flex items-center gap-0.5">
            <Shield size={10} className="text-text-muted" />
            <span className="text-[9px] text-text-muted">{data.middleware.length}</span>
          </div>
        )}
        {data.showSchemas && (
          <>
            <div className="flex items-center gap-0.5" title="Variables schema">
              {data.hasVariablesSchema ? (
                <CheckCircle size={10} className="text-emerald-400" />
              ) : (
                <XCircle size={10} className="text-zinc-600" />
              )}
              <span className="text-[9px] text-text-muted">V</span>
            </div>
            <div className="flex items-center gap-0.5" title="Response schema">
              {data.hasResponseSchema ? (
                <CheckCircle size={10} className="text-emerald-400" />
              ) : (
                <XCircle size={10} className="text-zinc-600" />
              )}
              <span className="text-[9px] text-text-muted">R</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export const graphNodeTypes: NodeTypes = {
  source: SourceNode,
  group: GroupNode,
  endpoint: EndpointNode,
}
