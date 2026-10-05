import type { SparkPath } from "@/features/analytics/spark-path";
import { cn } from "@/lib/utils";

interface SparkLineProps {
  spark: SparkPath;
  /** A text colour class: the line, its faint area and its end dot take it. */
  tone: string;
}

/**
 * A figure's sparkline: the line across the range over a faint area, with
 * a dot where it ends — now. It stretches to the width it is given.
 *
 * @param props - The path, and the colour it is drawn in
 * @returns The sparkline
 * @example
 * ```tsx
 * <SparkLine spark={sparkPath([3, 5, 4])} tone="text-brand" />
 * ```
 */
export function SparkLine({ spark, tone }: SparkLineProps): React.ReactNode {
  return (
    <div aria-hidden="true" className={cn("relative h-8.5", tone)}>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="block h-8.5 w-full overflow-visible"
      >
        <path d={spark.area} className="fill-[color-mix(in_srgb,currentColor_10%,transparent)]" />
        <path
          d={spark.line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute -right-0.75 -mt-[3.5px] size-1.75 rounded-full bg-current shadow-[0_0_0_3px_color-mix(in_srgb,currentColor_22%,transparent)]"
        style={{ top: `${spark.end * 100}%` }}
      />
    </div>
  );
}
