import { ChevronDown } from "lucide-react"
import { useState } from "react"

// ── Settings Section ────────────────────────────────────────────────────────

export function SettingsSection({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string
  description: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border border-border-default bg-surface-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="text-left">
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
          <p className="text-xs text-text-muted">{description}</p>
        </div>
        <ChevronDown
          size={16}
          className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-border-subtle px-4 py-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Setting Row ─────────────────────────────────────────────────────────────

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-secondary">{label}</p>
        {description && (
          <p className="text-[11px] text-text-muted">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

// ── Toggle Switch ───────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? "bg-indigo-500" : "bg-surface-3"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : ""
        }`}
      />
    </button>
  )
}

// ── Select ──────────────────────────────────────────────────────────────────

export function Select<TValue extends string | number>({
  value,
  options,
  onChange,
}: {
  value: TValue
  options: { value: TValue; label: string }[]
  onChange: (value: TValue) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TValue)}
      className="rounded border border-border-default bg-surface-1 px-2 py-1 text-xs text-text-primary outline-none focus:border-indigo-500"
    >
      {options.map((opt) => (
        <option key={String(opt.value)} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

// ── Number Input ────────────────────────────────────────────────────────────

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (!Number.isNaN(n)) onChange(n)
      }}
      min={min}
      max={max}
      step={step}
      className="w-24 rounded border border-border-default bg-surface-1 px-2 py-1 text-xs text-text-primary outline-none focus:border-indigo-500"
    />
  )
}
