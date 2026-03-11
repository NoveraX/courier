import {
  Clock,
  ExternalLink,
  FileCode,
  Globe,
  HardDrive,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react"

import type { SourceStatusInfo, SourceSummary } from "./types"
import { ActionButton, STATUS_CONFIG, StatusBadge, formatRelativeTime, truncateUrl } from "./registry-helpers"

export function RegistryCard({
  source,
  statusInfo,
  onCheckUpdates,
  onRemove,
}: {
  source: SourceSummary
  statusInfo: SourceStatusInfo
  onCheckUpdates: () => void
  onRemove: () => void
}) {
  const cfg = STATUS_CONFIG[statusInfo.status]

  return (
    <div className="group rounded-lg border border-border-default bg-surface-0 p-4 transition-colors hover:border-border-subtle">
      <div className="flex items-start justify-between">
        <CardHeader name={source.name} version={source.version} />
        <StatusBadge icon={cfg.icon} color={cfg.color} label={cfg.label} spinning={statusInfo.status === "checking"} />
      </div>

      {statusInfo.status === "error" && statusInfo.error && (
        <p className="mt-2 text-xs text-red-400">{statusInfo.error}</p>
      )}

      <CardStats source={source} />
      <SourceOrigin source={source} />
      <CardActions
        canCheck={source.specSource.type === "url"}
        checking={statusInfo.status === "checking"}
        onCheckUpdates={onCheckUpdates}
        onRemove={onRemove}
      />
    </div>
  )
}

function CardHeader({ name, version }: { name: string; version: string }) {
  return (
    <div className="flex items-center gap-2">
      <FileCode size={16} className="text-indigo-400" />
      <span className="font-medium text-sm">{name}</span>
      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-muted">v{version}</span>
    </div>
  )
}

function CardStats({ source }: { source: SourceSummary }) {
  return (
    <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
      <span>{source.endpointCount} endpoints</span>
      {source.modifiedCount > 0 && (
        <span className="text-amber-400">{source.modifiedCount} modified</span>
      )}
      <span className="flex items-center gap-1">
        <Clock size={10} />
        {formatRelativeTime(source.lastSynced)}
      </span>
    </div>
  )
}

function SourceOrigin({ source }: { source: SourceSummary }) {
  const Icon = source.specSource.type === "url" ? Globe : HardDrive
  const label = source.specSource.type === "url"
    ? truncateUrl(source.specSource.value)
    : source.specSource.value

  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
      <Icon size={10} />
      <span className="truncate max-w-[280px]" title={source.specSource.value}>{label}</span>
      {source.specSource.type === "url" && <ExternalLink size={9} className="shrink-0 opacity-50" />}
      <span className="mx-1 text-border-subtle">→</span>
      <span className="text-text-secondary">{source.outputDir}</span>
    </div>
  )
}

function CardActions({
  canCheck,
  checking,
  onCheckUpdates,
  onRemove,
}: {
  canCheck: boolean
  checking: boolean
  onCheckUpdates: () => void
  onRemove: () => void
}) {
  return (
    <div className="mt-3 flex items-center gap-1 border-t border-border-default pt-3 opacity-0 transition-opacity group-hover:opacity-100">
      {canCheck && (
        <ActionButton onClick={onCheckUpdates} disabled={checking} icon={RefreshCw} label="Check for Updates" />
      )}
      <ActionButton onClick={() => {}} icon={Settings} label="Settings" />
      <div className="flex-1" />
      <ActionButton onClick={onRemove} icon={Trash2} label="Remove" danger />
    </div>
  )
}
