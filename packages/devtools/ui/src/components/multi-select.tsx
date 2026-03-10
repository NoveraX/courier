import { useState, useEffect, useRef } from "react"
import { ChevronDown } from "lucide-react"

// ── MultiSelect Dropdown ─────────────────────────────────────────────────────

export function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onChange,
  renderOption,
}: {
  label: string
  options: T[]
  selected: T[]
  onChange: (v: T[]) => void
  renderOption?: (o: T) => string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function toggle(option: T) {
    onChange(
      selected.includes(option)
        ? selected.filter((s) => s !== option)
        : [...selected, option],
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex h-6 items-center gap-1 rounded px-2 text-[10px] transition-colors ${
          selected.length > 0
            ? "bg-indigo-500/15 text-indigo-400"
            : "bg-surface-1 text-text-muted hover:text-text-secondary"
        }`}
      >
        {label}
        {selected.length > 0 && <span className="font-medium">({selected.length})</span>}
        <ChevronDown
          size={10}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-35 rounded-lg border border-border-default bg-surface-1 p-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors ${
                selected.includes(option)
                  ? "bg-indigo-500/10 text-text-primary"
                  : "text-text-secondary hover:bg-surface-2"
              }`}
            >
              <div
                className={`h-3 w-3 shrink-0 rounded border ${
                  selected.includes(option)
                    ? "border-indigo-500 bg-indigo-500"
                    : "border-border-default"
                }`}
              >
                {selected.includes(option) && (
                  <svg viewBox="0 0 12 12" className="text-white">
                    <path
                      d="M3 6l2 2 4-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </div>
              <span className="capitalize">
                {renderOption ? renderOption(option) : option.replace("_", " ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
