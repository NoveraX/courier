import { useState } from "react"
import {
  ExternalLink,
  FileCode,
  Globe,
  HardDrive,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react"

import type { ParsedSpec, SourceStatusInfo, SourceSummary } from "./types"
import { ActionButton, STATUS_CONFIG, StatusBadge, truncateUrl } from "./registry-helpers"
import { RegistrySettings } from "./registry-settings"
import { UpdateImport } from "./update-import"

export function RegistryCard({
  source,
  statusInfo,
  onCheckUpdates,
  onManualUpdate,
  onRemove,
  onRegenerated,
}: {
  source: SourceSummary
  statusInfo: SourceStatusInfo
  onCheckUpdates: () => void
  onManualUpdate: (spec: ParsedSpec) => void
  onRemove: () => void
  onRegenerated: () => void
}) {
  const [showSettings, setShowSettings] = useState(false)
  const [showUpdateImport, setShowUpdateImport] = useState(false)
  const cfg = STATUS_CONFIG[statusInfo.status]
  const isRemote = source.importType === "url"

  const handleCheckUpdates = () => {
    if (isRemote) {
      onCheckUpdates()
    } else {
      setShowUpdateImport(true)
    }
  }

  const handleParsed = (spec: ParsedSpec) => {
    setShowUpdateImport(false)
    onManualUpdate(spec)
  }

  return (
    <div className="group rounded-lg border border-border-default bg-surface-0 p-4 transition-colors hover:border-border-subtle">
      <div className="flex items-start justify-between">
        <CardHeader name={source.name} />
        <StatusBadge icon={cfg.icon} color={cfg.color} label={cfg.label} spinning={statusInfo.status === "checking"} />
      </div>

      {statusInfo.status === "error" && statusInfo.error && (
        <p className="mt-2 text-xs text-red-400">{statusInfo.error}</p>
      )}

      <CardStats source={source} />
      <SourceOrigin source={source} />
      <CardActions
        checking={statusInfo.status === "checking"}
        showSettings={showSettings}
        onCheckUpdates={handleCheckUpdates}
        onToggleSettings={() => setShowSettings((v) => !v)}
        onRemove={onRemove}
      />

      {showSettings && <RegistrySettings source={source} onClose={() => setShowSettings(false)} onRegenerated={onRegenerated} />}
      {showUpdateImport && <UpdateImport sourceName={source.name} onParsed={handleParsed} onCancel={() => setShowUpdateImport(false)} />}
    </div>
  )
}

function CardHeader({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2">
      <FileCode size={16} className="text-indigo-400" />
      <span className="font-medium text-sm">{name}</span>
    </div>
  )
}

function CardStats({ source }: { source: SourceSummary }) {
  return (
    <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
      <span>{source.endpointCount} endpoints</span>
    </div>
  )
}

function SourceOrigin({ source }: { source: SourceSummary }) {
  const isUrl = source.importType === "url"
  const Icon = isUrl ? Globe : HardDrive
  const label = isUrl ? truncateUrl(source.specUrl) : `Imported from ${source.importType}`

  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
      <Icon size={10} />
      <span className="truncate max-w-[280px]" title={source.specUrl || undefined}>{label}</span>
      {isUrl && <ExternalLink size={9} className="shrink-0 opacity-50" />}
      <span className="mx-1 text-border-subtle">→</span>
      <span className="text-text-secondary">{source.outputDir}</span>
    </div>
  )
}

function CardActions({
  checking,
  showSettings,
  onCheckUpdates,
  onToggleSettings,
  onRemove,
}: {
  checking: boolean
  showSettings: boolean
  onCheckUpdates: () => void
  onToggleSettings: () => void
  onRemove: () => void
}) {
  return (
    <div className="mt-3 flex items-center gap-1 border-t border-border-default pt-3 opacity-0 transition-opacity group-hover:opacity-100">
      <ActionButton onClick={onCheckUpdates} disabled={checking} icon={RefreshCw} label="Check for Updates" />
      <ActionButton
        onClick={onToggleSettings}
        icon={Settings}
        label={showSettings ? "Hide Settings" : "Settings"}
        active={showSettings}
      />
      <div className="flex-1" />
      <ActionButton onClick={onRemove} icon={Trash2} label="Remove" danger />
    </div>
  )
}
