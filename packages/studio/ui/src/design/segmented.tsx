import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** One of a segmented control's choices. */
export interface SegmentedOption<TValue extends string> {
  value: TValue;
  label: string;
  icon?: LucideIcon | undefined;
  /** A count after the label, coloured as an error's when it counts errors. */
  count?: number | undefined;
  countTone?: "err" | "subtle" | undefined;
  /** A dot after the label: what the option shows was changed. */
  dot?: boolean | undefined;
}

interface SegmentedProps<TValue extends string> {
  options: readonly SegmentedOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  /** What the choice is about, for assistive technology. */
  label: string;
  /** How loud an unchosen option reads: `muted` among filters, `subtle` among views of one thing. */
  quiet?: "muted" | "subtle" | undefined;
}

/**
 * A row of choices of which one is on: the Timeline's quick views, a
 * payload's tree or raw view, a snippet's flavour.
 *
 * @param props - The options, the one chosen, what chooses, and how quiet the others are
 * @returns The control
 * @example
 * ```tsx
 * <Segmented label="View" options={VIEWS} value={view} onChange={setView} />
 * ```
 */
export function Segmented<TValue extends string>({
  options,
  value,
  onChange,
  label,
  quiet = "muted",
}: SegmentedProps<TValue>): React.ReactNode {
  return (
    <fieldset
      aria-label={label}
      className="m-0 flex min-w-0 shrink-0 gap-0.5 rounded-card border border-line bg-inset p-0.5"
    >
      {options.map((option) => {
        const on = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-6 cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 text-small font-strong whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-brand",
              on ? "bg-raised text-fg" : quiet === "muted" ? "text-fg-muted" : "text-fg-subtle",
            )}
          >
            {Icon && <Icon aria-hidden="true" className="size-2.75" />}
            {option.label}
            {option.dot && (
              <>
                <span aria-hidden="true" className="size-1.25 shrink-0 rounded-full bg-brand" />
                <span className="sr-only">(changed)</span>
              </>
            )}
            {option.count !== undefined && (
              <span
                className={cn(
                  "text-meta font-medium tabular-nums",
                  option.countTone === "err" ? "text-err" : "text-fg-subtle",
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
