import type { NodeTypes } from "@xyflow/react"
import { Handle, Position } from "@xyflow/react"
import { Shield, Zap, CheckCircle, XCircle } from "lucide-react"

import { Badge, formatDuration } from "../../components/ui"

import type { MiddlewareStats, EndpointStats } from "./pipeline-builder"

// ── Custom pipeline node components ─────────────────────────────────────────

function ValidationNode({
  data,
}: {
  data: { label: string; target: "variables" | "response"; hasSchema: boolean }
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 shadow-lg ${
        data.hasSchema
          ? "border-emerald-500/30 bg-emerald-500/8"
          : "border-zinc-600/50 bg-surface-2"
      }`}
    >
      <Handle type="target" position={Position.Left} className={`!w-2 !h-2 ${data.hasSchema ? "!bg-emerald-400" : "!bg-zinc-400"}`} />
      <Handle type="source" position={Position.Right} className={`!w-2 !h-2 ${data.hasSchema ? "!bg-emerald-400" : "!bg-zinc-400"}`} />
      <div className="flex items-center gap-2">
        {data.hasSchema ? (
          <CheckCircle size={12} className="text-emerald-400" />
        ) : (
          <XCircle size={12} className="text-zinc-500" />
        )}
        <span className="text-[10px] font-medium text-text-primary">{data.label}</span>
      </div>
      <div className="mt-1 text-[9px] text-text-muted">
        {data.target === "variables" ? "Input" : "Output"} validation
      </div>
      <div className="mt-0.5 text-[9px] text-text-muted">
        {data.hasSchema ? "Schema defined" : "No schema"}
      </div>
    </div>
  )
}

function MiddlewareNode({
  data,
}: {
  data: { label: string; index: number; stats: MiddlewareStats | null }
}) {
  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/8 px-3 py-2.5 shadow-lg">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-violet-400" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-violet-400" />
      <div className="flex items-center gap-2">
        <Shield size={12} className="text-violet-400" />
        <span className="text-[10px] font-medium text-text-primary">{data.label}</span>
      </div>
      <div className="mt-1 text-[9px] text-text-muted">Middleware #{data.index + 1}</div>
      {data.stats && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className={`text-[9px] ${data.stats.avgDuration > 5 ? "text-amber-400" : "text-text-muted"}`}>
            ~{formatDuration(data.stats.avgDuration)}
          </span>
          {data.stats.errors > 0 && (
            <span className="text-[9px] text-red-400">{data.stats.errors} err</span>
          )}
        </div>
      )}
    </div>
  )
}

function EndpointPipelineNode({
  data,
}: {
  data: {
    label: string
    type: "query" | "mutation"
    prefix: string
    method: string
    stats: EndpointStats | null
  }
}) {
  const isQuery = data.type === "query"
  return (
    <div
      className={`rounded-lg border px-4 py-3 shadow-lg ${
        isQuery
          ? "border-sky-500/30 bg-sky-500/10"
          : "border-orange-500/30 bg-orange-500/10"
      }`}
    >
      <Handle type="target" position={Position.Left} className={`!w-2 !h-2 ${isQuery ? "!bg-sky-400" : "!bg-orange-400"}`} />
      <Handle type="source" position={Position.Right} className={`!w-2 !h-2 ${isQuery ? "!bg-sky-400" : "!bg-orange-400"}`} />
      <div className="flex items-center gap-2">
        <Zap size={12} className={isQuery ? "text-sky-400" : "text-orange-400"} />
        <span className="text-xs font-semibold text-text-primary">{data.label}</span>
        <Badge variant={isQuery ? "sky" : "orange"}>{data.type}</Badge>
      </div>
      <div className="mt-1 text-[10px] text-text-muted">
        {isQuery ? "GET" : "POST"} {data.prefix}/{data.method}
      </div>
      {data.stats && (
        <div className="mt-1.5 flex items-center gap-2 text-[9px]">
          <span className="text-text-muted">{data.stats.calls} calls</span>
          <span className={data.stats.avgTotal > 500 ? "text-red-400" : data.stats.avgTotal > 200 ? "text-amber-400" : "text-emerald-400"}>
            ~{formatDuration(data.stats.avgTotal)}
          </span>
          {data.stats.errorRate > 0 && (
            <span className={data.stats.errorRate > 10 ? "text-red-400" : "text-amber-400"}>
              {data.stats.errorRate.toFixed(0)}% err
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export const pipelineNodeTypes: NodeTypes = {
  validation: ValidationNode,
  middleware: MiddlewareNode,
  pipelineEndpoint: EndpointPipelineNode,
}
