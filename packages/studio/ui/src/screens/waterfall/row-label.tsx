import { methodText } from "@/design/method-color";
import { TONE_TEXT } from "@/design/tone";
import { endpointParts } from "@/features/requests/request-parts";
import { cn } from "@/lib/utils";
import { SharedChip } from "@/screens/timeline/shared-chip";
import type { RequestEntry } from "@/store/types";

export interface RowLabelProps {
  request: RequestEntry;
  /** The method column: the HTTP verb, or SSE / WS for a stream. */
  method: string;
  methodClass?: string | undefined;
  duration: string;
  durationClass: string;
  width: number;
  indent: boolean;
  selected: boolean;
  failed: boolean;
  /** Whether the label is a line of its own over the bar, rather than a column beside it. */
  stacked: boolean;
}

/**
 * The part of a Waterfall row that stays in place while the track
 * scrolls: the request's method and endpoint, and how long it took — in a
 * column beside the bar, or, on a chart too narrow for one, on a line over
 * the bar as wide as the chart shows.
 *
 * @param props - The request, how it ended, its width, how the row is marked, and where the label sits
 * @returns The label cell
 * @example
 * ```tsx
 * <RowLabel request={r} method="GET" duration="44ms" durationClass="text-fg" width={300} indent={false} selected={false} failed={false} stacked={false} />
 * ```
 */
export function RowLabel(props: RowLabelProps): React.ReactNode {
  const { request, method, methodClass, duration, durationClass, width, indent } = props;
  const { selected, failed, stacked } = props;
  const { prefix, name } = endpointParts(request);
  return (
    <span
      style={{ width }}
      className={cn(
        "sticky left-0 z-3 flex shrink-0 items-center gap-2.25 pr-3 font-mono text-small",
        stacked
          ? cn("h-6", indent ? "pl-7" : "pl-4")
          : cn(
              "overflow-hidden border-r border-line",
              indent ? "pl-8" : "pl-5",
              selected
                ? "bg-[color-mix(in_srgb,var(--color-brand)_10%,var(--color-bg))]"
                : failed
                  ? "bg-[color-mix(in_srgb,var(--color-err)_4%,var(--color-bg))]"
                  : "bg-bg",
            ),
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 w-0.5",
          stacked ? "top-0 h-10.75" : "inset-y-0",
          selected ? "bg-brand" : "bg-transparent",
        )}
      />
      <span
        className={cn("w-10 shrink-0 text-meta font-semibold", methodClass ?? methodText(method))}
      >
        {method}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="text-fg-subtle">{prefix}</span>
        <span className="text-fg">{name}</span>
      </span>
      {request.shared && <SharedChip shared={request.shared} />}
      <span className={cn("shrink-0 tabular-nums", durationClass)}>{duration}</span>
    </span>
  );
}

/**
 * The colour a duration is written in: plain, then a warning past the
 * slow threshold and an error past twice it.
 *
 * @param tone - The duration's tone
 * @returns Its text class
 * @example
 * ```ts
 * durationClassOf("warn"); // "text-warn"
 * ```
 */
export function durationClassOf(tone: "normal" | "warn" | "err"): string {
  return tone === "normal" ? "text-fg-muted" : TONE_TEXT[tone];
}
