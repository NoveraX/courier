import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

interface TickBoxProps {
  checked: boolean;
  /** Some of what it stands for is ticked, not all. */
  mixed?: boolean | undefined;
  label: string;
  onChange: () => void;
}

/**
 * A tick box as the design draws it, over a native checkbox that does the
 * work — mixed when only some of what it stands for is ticked. On a touch
 * screen the checkbox reaches past the box, for a finger to find.
 *
 * @param props - Whether it is ticked or mixed, what it ticks, and what ticking does
 * @returns The box
 * @example
 * ```tsx
 * <TickBox checked={all} mixed={some} label="Select orders" onChange={toggle} />
 * ```
 */
export function TickBox({
  checked,
  mixed = false,
  label,
  onChange,
}: TickBoxProps): React.ReactNode {
  const on = checked || mixed;
  return (
    <span className="relative flex size-3.75 shrink-0">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = mixed;
        }}
        onChange={onChange}
        className="peer absolute inset-0 m-0 cursor-pointer opacity-0 pointer-coarse:-inset-2.5"
      />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none flex size-full items-center justify-center rounded-chip border text-bg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
          on ? "border-brand bg-brand" : "border-line-strong",
        )}
      >
        {mixed ? (
          <Minus className="size-2.5" strokeWidth={3} />
        ) : (
          checked && <Check className="size-2.5" strokeWidth={3} />
        )}
      </span>
    </span>
  );
}
