import { cn } from "@/lib/utils";

interface ToggleSwitchProps {
  /** For a label elsewhere that names it. */
  id?: string | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What the switch turns on, for assistive technology. */
  label: string;
  disabled?: boolean | undefined;
  /** `md` in lists, `lg` beside a setting's description. */
  size?: "md" | "lg" | undefined;
}

/**
 * An on/off switch: a pill whose knob slides across and whose track takes
 * the brand colour while it is on. On a touch screen a tap just beside it
 * still flips it.
 *
 * @param props - Whether it is on, what flips it, what it turns on, whether it can be flipped, and its size
 * @returns The switch
 * @example
 * ```tsx
 * <ToggleSwitch label="Override users.list" checked={on} onChange={setOn} />
 * ```
 */
export function ToggleSwitch({
  id,
  checked,
  onChange,
  label,
  disabled = false,
  size = "md",
}: ToggleSwitchProps): React.ReactNode {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "hit-area relative shrink-0 cursor-pointer rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-50",
        size === "md" ? "h-5 w-8.5" : "h-5.5 w-9.5",
        checked ? "bg-brand" : "bg-raised",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-[left] duration-150",
          size === "md" ? "top-0.5" : "top-0.75",
          checked
            ? size === "md"
              ? "left-4"
              : "left-4.75"
            : size === "md"
              ? "left-0.5"
              : "left-0.75",
        )}
      />
    </button>
  );
}
