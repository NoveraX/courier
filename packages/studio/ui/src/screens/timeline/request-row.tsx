import { Pin } from "lucide-react";

import { methodText } from "@/design/method-color";
import { codeLabel, endpointParts, httpMethodOf, pathOf } from "@/features/requests/request-parts";
import { isStreamRequest, requestStateOf, STATE_META } from "@/features/requests/request-state";
import { useSecondNow } from "@/hooks/use-tick";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";
import type { RowContext } from "./row-values";
import { codeTone, durationOf, sizeOf } from "./row-values";
import { columnsOf } from "./table-columns";

interface RequestRowProps {
  request: RequestEntry;
  selected: boolean;
  context: RowContext;
  onSelect: (id: string) => void;
}

/**
 * A request in the Timeline: its state, method and name, its path, mode and
 * status, how long it took against a second, its size, when it began, and
 * a pin when it is pinned.
 *
 * @param props - The request, whether it is open, what the row needs, and what opens it
 * @returns The row
 * @example
 * ```tsx
 * <RequestRow request={r} selected={false} context={context} onSelect={open} />
 * ```
 */
export function RequestRow({
  request: r,
  selected,
  context,
  onSelect,
}: RequestRowProps): React.ReactNode {
  const state = requestStateOf(r);
  const { prefix, name } = endpointParts(r);
  const pulse = state === "pending" || state === "streaming";
  const counting = useSecondNow(pulse);
  const rowContext = counting === null ? context : { ...context, now: counting };
  const duration = durationOf(r, state, rowContext);
  const method = isStreamRequest(r) ? "GET" : httpMethodOf(r);
  const time =
    context.timestamps === "relative"
      ? formatRelativeTime(r.startedAt, context.now)
      : formatAbsoluteTime(r.startedAt);
  return (
    <button
      type="button"
      data-request-id={r.id}
      aria-pressed={selected}
      onClick={() => onSelect(r.id)}
      className={cn(
        "relative grid h-8.5 w-full cursor-pointer items-center gap-3 border-b border-line pr-4 pl-5 text-left font-mono text-small hover:bg-raised",
        columnsOf(context.wide),
        selected ? "bg-brand-dim" : state === "error" ? "bg-err-tint" : "bg-transparent",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-0.5", selected ? "bg-brand" : "bg-transparent")}
      />
      <span className={cn("text-meta font-semibold", methodText(method))}>{method}</span>
      <span className="flex min-w-0 items-baseline gap-2.5 overflow-hidden whitespace-nowrap">
        <span className="shrink-0">
          <span className="text-fg-subtle">{prefix}</span>
          <span className="text-fg">{name}</span>
        </span>
        <span className="truncate text-label text-fg-subtle">{pathOf(r.url)}</span>
      </span>
      {context.wide && (
        <span
          className={cn(
            "justify-self-start rounded-chip px-1.5 py-px font-sans text-meta font-strong",
            r.mode === "proxy" ? "bg-syntax-type/12 text-syntax-type" : "bg-raised text-fg-subtle",
          )}
        >
          {r.mode}
        </span>
      )}
      <span className={cn("tabular-nums", codeTone(r, state))}>{codeLabel(r, state)}</span>
      <span className="flex items-center justify-end gap-2">
        <span className="h-0.75 max-w-14 flex-1 overflow-hidden rounded-full bg-raised">
          <span
            className={cn("block h-full", duration.fill)}
            style={{ width: `${duration.bar}%` }}
          />
        </span>
        <span className={cn("min-w-12 text-right tabular-nums", duration.tone)}>
          {duration.text}
        </span>
      </span>
      {context.wide && (
        <span className="text-right text-fg-subtle tabular-nums">{sizeOf(r, state)}</span>
      )}
      <span className="text-right text-fg-subtle tabular-nums">{time}</span>
      <span
        className={cn(
          "flex justify-end text-syntax-keyword",
          r.pinned ? "opacity-100" : "opacity-0",
        )}
      >
        <Pin aria-hidden="true" className="size-3" />
        <span className="sr-only">{`${STATE_META[state].label}${r.pinned ? ", pinned" : ""}`}</span>
      </span>
    </button>
  );
}
