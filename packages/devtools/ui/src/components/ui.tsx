import { useState, useCallback } from "react"
import { Copy, Check } from "lucide-react"

// ── Badge ────────────────────────────────────────────────────────────────────

const BADGE_COLORS: Record<string, string> = {
  violet: "bg-violet-500/15 text-violet-400",
  sky: "bg-sky-500/15 text-sky-400",
  emerald: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
  zinc: "bg-zinc-500/15 text-zinc-400",
  rose: "bg-rose-500/15 text-rose-400",
  orange: "bg-orange-500/15 text-orange-400",
  indigo: "bg-indigo-500/15 text-indigo-400",
}

export type BadgeVariant = keyof typeof BADGE_COLORS

export function Badge({
  children,
  variant,
}: {
  children: React.ReactNode
  variant: BadgeVariant
}) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none ${BADGE_COLORS[variant]}`}
    >
      {children}
    </span>
  )
}

// ── Section ──────────────────────────────────────────────────────────────────

export function Section({
  title,
  children,
  actions,
}: {
  title: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {title}
        </h3>
        {actions}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

// ── Row ──────────────────────────────────────────────────────────────────────

export function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className={`truncate text-text-secondary ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  )
}

// ── CopyButton ───────────────────────────────────────────────────────────────

export function CopyButton({
  text,
  size = 12,
  className = "",
}: {
  text: string
  size?: number
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [text])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`shrink-0 text-text-muted hover:text-text-secondary transition-colors ${className}`}
      title="Copy to clipboard"
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  )
}

// ── TabSwitcher ──────────────────────────────────────────────────────────────

export function TabSwitcher<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-surface-1 p-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
            active === tab.id
              ? "bg-surface-2 text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Formatters ───────────────────────────────────────────────────────────────

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp

  if (diff < 1000) return "just now"
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function formatAbsoluteTime(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms"
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}
