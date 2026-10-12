import { Segmented } from "@/design/segmented";
import { LATENCY_SHAPES } from "@/features/mocks/latency-shape";
import type { LatencyDistribution } from "@/store/mock-slice";

/**
 * How a delay of one's own spreads across its window — uniform, normal or
 * log-normal — with a sentence on what the chosen shape does.
 *
 * @param props - The shape in force, and what picks another
 * @returns The field
 * @example
 * ```tsx
 * <LatencyShapeField shape="uniform" onChange={(shape) => send(shape)} />
 * ```
 */
export function LatencyShapeField({
  shape,
  onChange,
}: {
  shape: LatencyDistribution;
  onChange: (shape: LatencyDistribution) => void;
}): React.ReactNode {
  const hint = LATENCY_SHAPES.find((option) => option.value === shape)?.hint;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-control font-strong">Shape</span>
        <div className="scroll-row max-w-full min-w-0">
          <Segmented
            label="Delay shape"
            quiet="subtle"
            options={LATENCY_SHAPES}
            value={shape}
            onChange={onChange}
          />
        </div>
      </div>
      <p className="m-0 text-small text-fg-subtle">{hint}</p>
    </div>
  );
}
