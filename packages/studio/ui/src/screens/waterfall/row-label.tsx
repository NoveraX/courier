import { methodText } from "@/design/method-color";
import { TONE_FILL, TONE_TEXT } from "@/design/tone";
import { endpointParts } from "@/features/requests/request-parts";
import type { RequestState } from "@/features/requests/request-state";
import { STATE_META } from "@/features/requests/request-state";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";

export interface RowLabelProps {
  request: RequestEntry;
  state: RequestState;
  /** The method column: the HTTP verb, or SSE / WS for a stream. */
  method: string;
  methodClass?: string | undefined;
  duration: string;
  durationClass: string;
  width: number;
  indent: boolean;
  selected: boolean;
  failed: boolean;
}

/**
 * The part of a Waterfall row that stays in place while the track
 * scrolls: the request's state, its method and endpoint, and how long it
 * took.
 *
 * @param props - The request, how it ended, its columns and how the row is marked
 * @returns The label cell
 * @example
 * ```tsx
 * <RowLabel request={r} state="success" method="GET" duration="44ms" durationClass="text-fg" width={300} indent={false} selected={false} failed={false} />
 * ```
 */
export function RowLabel(props: RowLabelProps): React.ReactNode {
  const {
    request,
    state,
    method,
    methodClass,
    duration,
    durationClass,
    width,
    indent,
    selected,
    failed,
  } = props;
  const { prefix, name } = endpointParts(request);
  const tone = STATE_META[state].tone;
  const live = state === "pending" || state === "streaming";
  return (
    <span
      style={{ width }}
      className={cn(
        "sticky left-0 z-3 flex shrink-0 items-center gap-2.25 overflow-hidden border-r border-line pr-3 font-mono text-small",
        indent ? "pl-8" : "pl-5",
        selected
          ? "bg-[color-mix(in_srgb,var(--color-brand)_10%,var(--color-bg))]"
          : failed
            ? "bg-[color-mix(in_srgb,var(--color-err)_4%,var(--color-bg))]"
            : "bg-bg",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-0.5", selected ? "bg-brand" : "bg-transparent")}
      />
      <span
        aria-hidden="true"
        className={cn(
          "size-1.75 shrink-0 rounded-full",
          TONE_FILL[tone],
          live && "animate-pulse-live",
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
