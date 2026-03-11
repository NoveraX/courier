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
