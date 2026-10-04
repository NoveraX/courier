import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SegmentOption<TValue extends string = string> {
  value: TValue;
  label: string;
  icon?: React.ComponentType<{ className?: string }> | undefined;
  /** Extra content rendered after label (e.g. count badge) */
  extra?: React.ReactNode;
}

interface SegmentedControlProps<TValue extends string = string> {
  options: SegmentOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  /** Container className override */
  className?: string;
  /** Icon size — default "size-3" */
  iconSize?: string;
  /** Stretch buttons to fill container width evenly */
  stretch?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export function SegmentedControl<TValue extends string = string>({
  options,
  value,
  onChange,
  className,
  iconSize = "size-3",
  stretch,
}: SegmentedControlProps<TValue>): React.ReactElement {
  return (
    <div
      className={cn(
        "inline-flex h-7 items-center gap-0.5 rounded-md border border-border-subtle bg-muted/60 p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex h-6 items-center justify-center gap-1 rounded-[5px] px-2 text-[11px] font-medium transition-colors",
              stretch && "flex-1",
              active
                ? "bg-foreground text-background shadow-[0_1px_2px_0_oklch(0_0_0/0.2)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.icon && <opt.icon className={cn(iconSize, "shrink-0")} />}
            {opt.label}
            {opt.extra}
          </button>
        );
      })}
    </div>
  );
}
