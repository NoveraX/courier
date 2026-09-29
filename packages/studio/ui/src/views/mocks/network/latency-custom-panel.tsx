/**
 * Custom-mode editor panel for the latency controls (min/max/jitter sliders).
 *
 * Owns the slider rows and the cross-validation that keeps `min` ≤ `max`.
 */

import { LATENCY_DEFAULTS, type LatencyFormValues } from "./latency-presets";
import { SliderRow } from "./slider-row";

interface LatencyCustomPanelProps {
  vals: Partial<LatencyFormValues>;
  setValue: (
    name: "min" | "max" | "jitter",
    value: number,
    options: { shouldDirty: boolean },
  ) => void;
}

export function LatencyCustomPanel({
  vals,
  setValue,
}: LatencyCustomPanelProps): React.ReactElement {
  const min = vals.min ?? LATENCY_DEFAULTS.min;
  const max = vals.max ?? LATENCY_DEFAULTS.max;
  const jitter = vals.jitter ?? LATENCY_DEFAULTS.jitter;

  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-muted/10 p-3">
      <SliderRow
        label="Min"
        value={min}
        onChange={(v) => {
          setValue("min", v, { shouldDirty: true });
          if (v > max) setValue("max", v, { shouldDirty: true });
        }}
        max={2000}
        unit="ms"
      />
      <SliderRow
        label="Max"
        value={max}
        onChange={(v) => {
          setValue("max", v, { shouldDirty: true });
          if (v < min) setValue("min", v, { shouldDirty: true });
        }}
        min={min}
        max={5000}
        unit="ms"
      />
      <SliderRow
        label="Jitter"
        value={jitter}
        onChange={(v) => setValue("jitter", v, { shouldDirty: true })}
        max={500}
        unit="ms"
      />
    </div>
  );
}
