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
    <div className="flex gap-0.5 rounded-lg bg-card p-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
            active === tab.id
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-secondary-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
