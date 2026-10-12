import { Pin } from "lucide-react";

import { methodText } from "@/design/method-color";
import { codeLabel, pathOf } from "@/features/requests/request-parts";
import { STATE_META } from "@/features/requests/request-state";
import { cn } from "@/lib/utils";
import type { RequestRowProps } from "./request-row";
import { codeTone } from "./row-values";
import { useRowFigures } from "./use-row-figures";

/**
 * A request in a Timeline too narrow for its columns, on two lines: its
 * method, name and status — a pin when it is pinned — over its path, how
 * long it took and when it began. The name and the path shorten with an
 * ellipsis; the figures keep their room.
 *
 * @param props - The request, whether it is open, what the row needs, and what opens it
 * @returns The row
 * @example
 * ```tsx
 * <StackedRequestRow request={r} selected={false} context={context} onSelect={open} />
 * ```
 */
export function StackedRequestRow({
  request: r,
  selected,
  context,
  onSelect,
}: RequestRowProps): React.ReactNode {
  const { state, prefix, name, method, duration, time } = useRowFigures(r, context);
  return (
    <button
      type="button"
      data-request-id={r.id}
      aria-pressed={selected}
      onClick={() => onSelect(r.id)}
      className={cn(
        "relative grid h-13 w-full cursor-pointer grid-cols-[44px_minmax(0,1fr)_auto] content-center items-baseline gap-x-2.5 gap-y-1.25 border-b border-line px-4 text-left font-mono text-small hover:bg-raised",
        selected ? "bg-brand-dim" : state === "error" ? "bg-err-tint" : "bg-transparent",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-0.5", selected ? "bg-brand" : "bg-transparent")}
      />
      <span className={cn("text-meta font-semibold", methodText(method))}>{method}</span>
      <span className="truncate">
        <span className="text-fg-subtle">{prefix}</span>
        <span className="text-fg">{name}</span>
      </span>
      <span className="flex items-center justify-end gap-1.5">
        {r.pinned && <Pin aria-hidden="true" className="size-3 self-center text-syntax-keyword" />}
        <span className={cn("tabular-nums", codeTone(r, state))}>{codeLabel(r, state)}</span>
      </span>
      <span className="col-start-2 truncate text-label text-fg-subtle">{pathOf(r.url)}</span>
      <span className="flex justify-end gap-2.5 text-label whitespace-nowrap tabular-nums">
        <span className={duration.tone}>{duration.text}</span>
        <span className="text-fg-subtle">{time}</span>
      </span>
      <span className="sr-only">{`${STATE_META[state].label}${r.pinned ? ", pinned" : ""}`}</span>
    </button>
  );
}
