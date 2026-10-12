import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** One of a segmented control's choices. */
export interface SegmentedOption<TValue extends string> {
  value: TValue;
  label: string;
  icon?: LucideIcon | undefined;
  /** A count after the label, coloured as an error's when it counts errors, a warning's when it counts changes. */
  count?: number | undefined;
  countTone?: "err" | "warn" | "subtle" | undefined;
  /** What the option shows was changed: its label takes the accent colour, and assistive technology hears so. */
  changed?: boolean | undefined;
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
 * A segmented row's frame, for a row of other parts — links, say — that
 * should look and size as `Segmented` does. On a touch screen its edge is
 * drawn inside it rather than around it, so the segments can reach its
 * whole height.
 */
export const SEGMENT_FRAME =
  "rounded-card border border-line bg-inset p-0.5 pointer-coarse:border-0 pointer-coarse:inset-ring pointer-coarse:inset-ring-line";

/**
 * A segment's tap area, around its pill: the pill's own size under a
 * mouse; under a finger the frame's whole height, reaching over the
 * frame's padding.
 */
export const SEGMENT_TARGET =
  "group/segment flex shrink-0 cursor-pointer outline-none pointer-coarse:-my-0.5 pointer-coarse:h-9 pointer-coarse:items-center";

/** A segment as it is drawn, inside its tap area: the one chosen takes `bg-raised`. */
export const SEGMENT_PILL =
  "flex h-6 items-center gap-1.5 rounded-[6px] px-2.5 text-small font-strong whitespace-nowrap transition-colors group-focus-visible/segment:outline-2 group-focus-visible/segment:outline-brand pointer-coarse:h-7.5";

/**
 * A row of choices of which one is on: the Timeline's quick views, a
 * payload's tree or raw view, a snippet's flavour. On a touch screen each
 * choice takes the row's whole height, a finger's.
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
    <fieldset aria-label={label} className={cn("m-0 flex min-w-0 shrink-0 gap-0.5", SEGMENT_FRAME)}>
      {options.map((option) => {
        const on = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={SEGMENT_TARGET}
          >
            <span
              className={cn(
                SEGMENT_PILL,
                on ? "bg-raised text-fg" : quiet === "muted" ? "text-fg-muted" : "text-fg-subtle",
              )}
            >
              {Icon && <Icon aria-hidden="true" className="size-2.75" />}
              <span className={cn(option.changed && "text-brand")}>{option.label}</span>
              {option.changed && <span className="sr-only">(changed)</span>}
              {option.count !== undefined && (
                <span
                  className={cn(
                    "text-meta font-medium tabular-nums",
                    option.countTone === "err"
                      ? "text-err"
                      : option.countTone === "warn"
                        ? "text-warn"
                        : "text-fg-subtle",
                  )}
                >
                  {option.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
