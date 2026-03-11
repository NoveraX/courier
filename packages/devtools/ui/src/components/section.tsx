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
