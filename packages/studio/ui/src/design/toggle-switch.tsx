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

/* Each size's track and knob, and the room a finger gets around the track: padding, so the
   switch is 36 px or more across and high on a touch screen without reaching past its box. */
const SIZE = {
  md: {
    track: "h-5 w-8.5",
    touch: "pointer-coarse:px-px pointer-coarse:py-2",
    knob: "top-0.5",
    off: "left-0.5",
    on: "left-4",
  },
  lg: {
    track: "h-5.5 w-9.5",
    touch: "pointer-coarse:py-2",
    knob: "top-0.75",
    off: "left-0.75",
    on: "left-4.75",
  },
} as const;

/**
 * An on/off switch: a pill whose knob slides across and whose track takes
 * the brand colour while it is on. On a touch screen the switch reaches
 * above and below its track, for a finger to find.
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
  const look = SIZE[size];
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
        "group/switch inline-flex shrink-0 cursor-pointer rounded-full outline-none disabled:cursor-default disabled:opacity-50",
        look.touch,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative block rounded-full transition-colors duration-150 group-focus-visible/switch:outline-2 group-focus-visible/switch:outline-offset-2 group-focus-visible/switch:outline-brand",
          look.track,
          checked ? "bg-brand" : "bg-raised",
        )}
      >
        <span
          className={cn(
            "absolute size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-[left] duration-150",
            look.knob,
            checked ? look.on : look.off,
          )}
        />
      </span>
    </button>
  );
}
