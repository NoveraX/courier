import type { LucideIcon } from "lucide-react"
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react"

import type { SourceStatus } from "./types"

export const STATUS_CONFIG: Record<SourceStatus, { color: string; icon: LucideIcon; label: string }> = {
  "up-to-date": { color: "text-emerald-400", icon: CheckCircle, label: "Up to date" },
  "updates-available": { color: "text-amber-400", icon: AlertCircle, label: "Updates available" },
  checking: { color: "text-sky-400", icon: Loader2, label: "Checking..." },
  error: { color: "text-red-400", icon: AlertCircle, label: "Error" },
}

export function StatusBadge({
  icon: Icon,
  color,
  label,
  spinning,
}: {
  icon: LucideIcon
  color: string
  label: string
  spinning: boolean
}) {
  return (
    <div className={`flex items-center gap-1 text-xs ${color}`}>
      <Icon size={12} className={spinning ? "animate-spin" : ""} />
      <span>{label}</span>
    </div>
  )
}

export function ActionButton({
  onClick,
  icon: Icon,
  label,
  disabled,
  danger,
}: {
  onClick: () => void
  icon: LucideIcon
  label: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-30 ${
        danger
          ? "text-text-muted hover:bg-red-500/15 hover:text-red-400"
          : "text-text-muted hover:bg-surface-2 hover:text-text-secondary"
      }`}
    >
      <Icon size={12} />
      <span>{label}</span>
    </button>
  )
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function truncateUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.length > 30 ? `...${u.pathname.slice(-25)}` : u.pathname
    return `${u.hostname}${path}`
  } catch {
    return url.length > 50 ? `${url.slice(0, 47)}...` : url
  }
}
