import type { Delay } from "@/features/mocks/latency-window";
import { delayLabel, delayWindow } from "@/features/mocks/latency-window";
import { cn } from "@/lib/utils";
import type { LatencyDistribution } from "@/store/mock-slice";

/* Where in the window the delays fall, as each shape spreads them. */
const FILL: Readonly<Record<LatencyDistribution, string>> = {
  uniform: "bg-warn/50",
  normal: "bg-linear-to-r from-warn/25 via-warn/75 to-warn/25",
  "log-normal": "bg-linear-to-r from-warn/60 via-warn/45 via-25% to-warn/10",
};

const MARKS = ["0", "500ms", "1s", "1.5s", "2s+"];

/**
 * The window of delays the mock answers in, on a scale to two seconds:
 * where it starts and ends, its base, and where in it the delays fall.
 *
 * @param props - The base and jitter, and the shape the delays are drawn in
 * @returns The window
 * @example
 * ```tsx
 * <LatencyWindowBar delay={{ base: 600, jitter: 450 }} shape="log-normal" />
 * ```
 */
export function LatencyWindowBar({
  delay,
  shape,
}: {
  delay: Delay;
  shape: LatencyDistribution;
}): React.ReactNode {
  const span = delayWindow(delay);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-small text-fg-subtle">Response window</span>
        <span className="font-mono text-small">
          {delay.base ? `${delayLabel(span.low)} – ${delayLabel(span.high)}` : "passthrough"}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="relative h-8.5 rounded-card border border-line bg-inset bg-[repeating-linear-gradient(90deg,var(--color-line)_0_1px,transparent_1px_25%)]"
      >
        <span
          className={cn("absolute top-1.5 bottom-1.5 min-w-0.75 rounded-[5px]", FILL[shape])}
          style={{ left: `${span.lowAt}%`, width: `${span.highAt - span.lowAt}%` }}
        />
        <span
          className="absolute top-0.75 bottom-0.75 w-0.5 rounded-[1px] bg-warn"
          style={{ left: `${span.baseAt}%` }}
        />
      </div>
      <div aria-hidden="true" className="flex justify-between font-mono text-micro text-fg-subtle">
        {MARKS.map((mark) => (
          <span key={mark}>{mark}</span>
        ))}
      </div>
    </div>
  );
}
