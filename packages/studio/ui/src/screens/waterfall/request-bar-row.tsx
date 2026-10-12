import { durationTone } from "@/features/requests/duration-tone";
import { httpMethodOf } from "@/features/requests/request-parts";
import { requestStateOf } from "@/features/requests/request-state";
import type { TrackScale } from "@/features/waterfall/time-window";
import type { RequestItem } from "@/features/waterfall/waterfall-rows";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { mouseOnly } from "./mouse-only";
import { durationClassOf, RowLabel } from "./row-label";
import { SEGMENT_STYLE } from "./segment-style";
import type { SegmentTip } from "./segment-tip";
import type { TrackLayout } from "./track-layout";
import { TRACK_LAYOUT } from "./track-layout";

export interface RequestBarRowProps {
  item: RequestItem;
  indent: boolean;
  scale: TrackScale;
  /** The label's width: its column's, or the chart's in view when it sits over the bar. */
  labelPx: number;
  /** Whether the label is a column beside the bar, or a line over it. */
  layout: TrackLayout;
  slowMs: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onTip: (tip: SegmentTip | null) => void;
}

function badgeOf(
  state: string,
  code: number | undefined,
): { text: string; tone: string } | undefined {
  if (state === "error")
    return { text: code ? String(code) : "error", tone: "bg-err-dim text-err" };
  if (state === "validation_error") return { text: "schema", tone: "bg-warn-dim text-warn" };
  if (state === "aborted") return { text: "aborted", tone: "bg-raised text-fg-subtle" };
  return undefined;
}

/**
 * A request's row in the Waterfall: its label, and its bar on the track —
 * each part sized by the time it took and named when a mouse points at it —
 * with its duration and, for a failure, what it failed with. A tap opens
 * the request, whose Timing tab names the parts.
 *
 * @param props - The request and its bar, the scale, the layout, and what selecting and pointing do
 * @returns The row
 * @example
 * ```tsx
 * <RequestBarRow item={item} indent scale={scale} labelPx={300} layout="columns" slowMs={500} selected={false} onSelect={open} onTip={setTip} />
 * ```
 */
export function RequestBarRow(props: RequestBarRowProps): React.ReactNode {
  const { item, indent, scale, labelPx, layout, slowMs, selected, onSelect, onTip } = props;
  const place = TRACK_LAYOUT[layout];
  const { request: r, bar } = item;
  const state = requestStateOf(r);
  const pending = state === "pending";
  const x = scale.toPx(r.startedAt);
  const width = Math.max(3, scale.toPx(r.startedAt + bar.total) - x);
  const badge = badgeOf(state, r.statusCode);
  const failed = state === "error";
  const ring = failed
    ? "shadow-[0_0_0_1px_var(--color-err)]"
    : state === "validation_error"
      ? "shadow-[0_0_0_1px_var(--color-warn)]"
      : selected
        ? "shadow-[0_0_0_1px_var(--color-fg)]"
        : "";
  const tip = (key: (typeof bar.segments)[number]) =>
    mouseOnly((e) =>
      onTip({
        requestId: r.id,
        key: key.key,
        duration: key.duration,
        total: bar.total,
        x: e.clientX,
        y: e.clientY,
      }),
    );
  return (
    <button
      type="button"
      data-request-id={r.id}
      aria-pressed={selected}
      onClick={() => onSelect(r.id)}
      onPointerLeave={() => onTip(null)}
      className={cn(
        "relative z-1 flex w-full cursor-pointer border-b border-line text-left transition-colors",
        place.row,
        selected
          ? "bg-brand-dim"
          : failed
            ? "bg-err-tint hover:bg-brand-tint"
            : "hover:bg-brand-tint",
      )}
    >
      <RowLabel
        request={r}
        method={httpMethodOf(r)}
        duration={pending ? "···" : formatDuration(bar.total)}
        durationClass={pending ? "text-warn" : durationClassOf(durationTone(bar.total, slowMs))}
        width={labelPx}
        indent={indent}
        selected={selected}
        failed={failed}
        stacked={layout === "stacked"}
      />
      <span className={cn("relative block shrink-0", place.track)} style={{ width: scale.trackPx }}>
        <span
          style={{ left: x, width }}
          className={cn("absolute flex h-3.5 gap-px overflow-hidden rounded-chip", place.bar, ring)}
        >
          {bar.segments.map((segment, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: a bar's parts in order; a kind can recur
              key={i}
              role="img"
              aria-label={`${SEGMENT_STYLE[segment.key].label} ${formatDuration(segment.duration)}`}
              onPointerEnter={tip(segment)}
              onPointerMove={tip(segment)}
              style={{ flex: `${Math.max(0.5, segment.duration)} 1 0px` }}
              className={cn("min-w-px", SEGMENT_STYLE[segment.key].fill)}
            />
          ))}
        </span>
        <span
          style={{ left: x + width }}
          className="pointer-events-none absolute inset-y-0 flex items-center gap-1.5 pl-2 font-mono text-meta whitespace-nowrap text-fg-subtle"
        >
          {formatDuration(bar.total)}
          {badge && (
            <span
              className={cn(
                "flex h-4 items-center rounded-chip px-1.25 text-micro font-semibold",
                badge.tone,
              )}
            >
              {badge.text}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
