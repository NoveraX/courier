import { cn } from "@/lib/utils";

/* Each size's box, track and thumb, as the design draws them. */
const SIZE = {
  lg: { box: "h-5.5", track: "top-2 h-1.5", thumb: "top-0.5 size-4.5", half: 9 },
  md: { box: "h-4.5", track: "top-1.75 h-1", thumb: "top-0.25 size-4", half: 8 },
  sm: { box: "h-4.5", track: "top-1.75 h-1", thumb: "top-0.5 size-3.5", half: 7 },
} as const;

interface RangeSliderProps {
  value: number;
  min?: number | undefined;
  max: number;
  step?: number | undefined;
  /** What the slider sets, for assistive technology. */
  label: string;
  onChange: (value: number) => void;
  /** The value settled: the pointer let go, or a key let up. */
  onCommit?: ((value: number) => void) | undefined;
  /** The fill: a warning-to-error gradient, or the brand colour. */
  tone?: "risk" | "brand" | undefined;
  /** A fill of its own, in place of the tone's. */
  fill?: string | undefined;
  /** `lg` for a card's main value, `md` for a setting, `sm` for a row's, which has no halo. */
  size?: keyof typeof SIZE | undefined;
  disabled?: boolean | undefined;
}

/**
 * A slider drawn as the design draws it — a track, its fill and a round
 * thumb — over a native range input that does the work, so the keyboard,
 * the pointer and assistive technology all reach it.
 *
 * @param props - The value and its bounds, what it sets, what follows a change and a settled value, its fill and size
 * @returns The slider
 * @example
 * ```tsx
 * <RangeSlider label="Error rate" value={rate} max={100} onChange={setRate} onCommit={send} tone="risk" size="lg" />
 * ```
 */
export function RangeSlider(props: RangeSliderProps): React.ReactNode {
  const {
    value,
    min = 0,
    max,
    step = 1,
    label,
    onChange,
    onCommit,
    tone = "brand",
    fill,
    size = "md",
    disabled = false,
  } = props;
  const share = max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;
  const look = SIZE[size];
  const halo =
    size === "sm" ? "" : tone === "risk" ? "ring-4 ring-err/22" : "ring-4 ring-brand-dim";
  return (
    <div className={cn("relative", look.box, disabled && "opacity-50")}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit?.(Number(e.currentTarget.value))}
        onKeyUp={(e) => onCommit?.(Number(e.currentTarget.value))}
        className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
      />
      <div
        className={cn("pointer-events-none absolute inset-x-0 rounded-full bg-raised", look.track)}
      />
      <div
        className={cn(
          "pointer-events-none absolute left-0 rounded-full",
          look.track,
          fill ?? (tone === "risk" ? "bg-linear-to-r from-warn to-err" : "bg-brand"),
        )}
        style={{ width: `${share * 100}%` }}
      />
      <div
        className={cn(
          "pointer-events-none absolute rounded-full bg-fg shadow-[0_1px_3px_rgb(0_0_0/0.4)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
          look.thumb,
          halo,
        )}
        style={{ left: `calc(${share * 100}% - ${look.half}px)` }}
      />
    </div>
  );
}
