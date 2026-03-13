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
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`truncate text-secondary-foreground ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
