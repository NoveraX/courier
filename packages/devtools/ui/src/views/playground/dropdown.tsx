import { ChevronDown } from "lucide-react"

export function Dropdown({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-border-default bg-surface-1 py-1 pl-2 pr-6 font-mono text-[11px] text-text-primary outline-none focus:border-indigo-500/50"
      >
        {!options.includes(value) && (
          <option value={value} disabled>
            {value || placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown
        size={10}
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted"
      />
    </div>
  )
}
