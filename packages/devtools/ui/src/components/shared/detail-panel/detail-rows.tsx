import { CopyButton } from "@/components/shared/copy-button";

/** Section with uppercase title and bordered container */
export function DetailSection({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{title}</h4>
      <div className="rounded-lg border border-border-subtle divide-y divide-border-subtle">
        {children}
      </div>
    </div>
  );
}

/** Label → value row inside a DetailSection */
export function DetailRow({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <span className="shrink-0 text-body-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-body-sm text-foreground">{children}</span>
    </div>
  );
}

/** Copyable row with label + monospace value + copy button */
export function QuickCopyRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0">
      <span className="w-20 shrink-0 text-body-sm text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate mono-sm text-foreground/80">{value}</code>
      <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

/** Centered empty state placeholder */
export function DetailEmpty({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center text-body-sm text-muted-foreground/50">
      {label}
    </div>
  );
}
