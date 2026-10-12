import type { GapMark, TimeTick } from "@/features/waterfall/time-ticks";

export interface RulerProps {
  ticks: readonly TimeTick[];
  gaps: readonly GapMark[];
  labelPx: number;
  trackPx: number;
  cursor: { x: number; label: string } | null;
}

/**
 * The Waterfall's header, which stays in view as it scrolls: the columns'
 * names over the labels — none when each row names its request over its
 * bar — and over the track its time marks, its idle gaps with how long
 * each lasted, and the time under the pointer.
 *
 * @param props - The marks, the gaps, the widths and the cursor
 * @returns The header
 * @example
 * ```tsx
 * <WaterfallRuler ticks={ticks} gaps={gaps} labelPx={300} trackPx={1200} cursor={null} />
 * ```
 */
export function WaterfallRuler({
  ticks,
  gaps,
  labelPx,
  trackPx,
  cursor,
}: RulerProps): React.ReactNode {
  return (
    <div className="sticky top-0 z-8 flex h-8 border-b border-line bg-bg">
      {labelPx > 0 && (
        <div
          style={{ width: labelPx }}
          className="sticky left-0 z-9 flex shrink-0 items-center gap-2 border-r border-line bg-bg pr-3 pl-5 text-badge text-fg-subtle"
        >
          <span>Request</span>
          <span className="flex-1" />
          <span>Total</span>
        </div>
      )}
      <div className="relative shrink-0" style={{ width: trackPx }}>
        {ticks.map((tick) => (
          <span
            key={tick.x}
            style={{ left: tick.x }}
            className="absolute inset-y-0 flex items-center border-l border-line-strong pl-1.5 font-mono text-micro whitespace-nowrap text-fg-subtle"
          >
            {tick.label}
          </span>
        ))}
        {gaps.map((gap) => (
          <span
            key={gap.x}
            title={gap.title}
            style={{ left: gap.x, width: gap.width }}
            className="absolute inset-y-1.75 flex items-center justify-center overflow-hidden rounded-chip bg-raised font-mono text-micro whitespace-nowrap text-fg-muted"
          >
            {gap.label}
          </span>
        ))}
        {cursor && (
          <span
            style={{ left: cursor.x }}
            className="absolute top-1.75 z-2 flex h-4.5 -translate-x-1/2 items-center rounded-[5px] bg-brand px-1.5 font-mono text-micro font-semibold whitespace-nowrap text-bg"
          >
            {cursor.label}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The lines behind the Waterfall's rows: one under each time mark, a
 * hatched band through each idle gap, and the pointer's time line.
 *
 * @param props - The marks, the gaps, the widths and the cursor
 * @returns The overlay
 * @example
 * ```tsx
 * <WaterfallGrid ticks={ticks} gaps={gaps} labelPx={300} trackPx={1200} cursor={null} />
 * ```
 */
export function WaterfallGrid({
  ticks,
  gaps,
  labelPx,
  trackPx,
  cursor,
}: RulerProps): React.ReactNode {
  return (
    <div
      aria-hidden="true"
      style={{ left: labelPx, width: trackPx }}
      className="pointer-events-none absolute top-8 bottom-0 z-0"
    >
      {ticks.map((tick) => (
        <span key={tick.x} style={{ left: tick.x }} className="absolute inset-y-0 w-px bg-line" />
      ))}
      {gaps.map((gap) => (
        <span
          key={gap.x}
          style={{ left: gap.x, width: gap.width }}
          className="absolute inset-y-0 border-x border-dashed border-line-strong bg-[repeating-linear-gradient(135deg,var(--color-line)_0_1px,transparent_1px_7px)]"
        />
      ))}
      {cursor && (
        <span style={{ left: cursor.x }} className="absolute inset-y-0 w-px bg-brand opacity-70" />
      )}
    </div>
  );
}
