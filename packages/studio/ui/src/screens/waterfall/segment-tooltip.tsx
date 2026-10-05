import { methodText } from "@/design/method-color";
import { TONE_DIM, TONE_TEXT } from "@/design/tone";
import { endpointName, httpMethodOf } from "@/features/requests/request-parts";
import { requestStateOf, STATE_META } from "@/features/requests/request-state";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { SEGMENT_STYLE } from "./segment-style";
import type { SegmentTip } from "./segment-tip";

/**
 * What a part of a bar is, shown above the pointer: its name, how long it
 * took and what share of the request, where the time went, and the request
 * it belongs to with how it ended.
 *
 * @param props - The part under the pointer
 * @returns The tooltip, or nothing once its request is gone
 * @example
 * ```tsx
 * {tip && <SegmentTooltip tip={tip} />}
 * ```
 */
export function SegmentTooltip({ tip }: { tip: SegmentTip }): React.ReactNode {
  const request = useStudioStore((s) => s.requests.find((r) => r.id === tip.requestId));
  if (!request) return null;
  const style = SEGMENT_STYLE[tip.key];
  const share = `${Math.round((tip.duration / Math.max(1, tip.total)) * 100)}%`;
  const state = STATE_META[requestStateOf(request)];
  const method = httpMethodOf(request);
  const left = Math.min(Math.max(tip.x, 135), window.innerWidth - 135);
  return (
    <div
      role="tooltip"
      style={{ left, top: tip.y }}
      className="pointer-events-none fixed z-95 flex w-62.5 -translate-x-1/2 translate-y-[calc(-100%-12px)] flex-col gap-1.5 rounded-panel bg-panel px-3 py-2.5 shadow-overlay"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={cn("size-2.25 rounded-[3px]", style.fill)} />
        <span className="text-control font-semibold">{style.label}</span>
        <span className="ml-auto font-mono text-small">{formatDuration(tip.duration)}</span>
      </div>
      <div className="flex items-center gap-2 text-label text-fg-subtle">
        <span>{share} of total</span>
        <span>·</span>
        <span>{style.hop}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-[2px] bg-raised">
        <span style={{ width: share }} className={cn("block h-full", style.fill)} />
      </div>
      <div className="flex items-center gap-2 font-mono text-badge">
        <span className={cn("text-meta font-semibold", methodText(method))}>{method}</span>
        <span className="min-w-0 flex-1 truncate text-fg-muted">{endpointName(request)}</span>
        <span
          className={cn(
            "flex h-4.5 items-center rounded-chip px-1.5 font-sans text-meta font-semibold",
            TONE_TEXT[state.tone],
            TONE_DIM[state.tone],
          )}
        >
          {state.label}
        </span>
      </div>
    </div>
  );
}
