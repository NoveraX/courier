import { ChevronsUpDown } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";

import { Dot } from "@/design/dot";
import { methodText } from "@/design/method-color";
import { codeLabel, endpointParts, httpMethodOf } from "@/features/requests/request-parts";
import { isFailedState, STATE_META } from "@/features/requests/request-state";
import { formatClockTime, formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types-request";
import type { Side } from "./side-tag";
import { SideTag } from "./side-tag";

/* How many of the newest calls the picker lists. */
const LISTED = 40;

interface RequestSlotProps {
  side: Side;
  request: RequestEntry;
  candidates: readonly RequestEntry[];
  onPick: (id: string) => void;
}

function Option({
  r,
  chosen,
  onPick,
}: {
  r: RequestEntry;
  chosen: boolean;
  onPick: () => void;
}): React.ReactNode {
  const { prefix, name } = endpointParts(r);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={chosen}
      className={cn(
        "grid h-8.5 w-full cursor-pointer grid-cols-[8px_40px_minmax(0,1fr)_40px_64px] items-center gap-2.5 rounded-[7px] px-2.5 text-left font-mono text-label hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
        chosen && "bg-brand-dim",
      )}
    >
      <Dot tone={STATE_META[r.status].tone} className="size-1.75" />
      <span className={cn("text-micro font-semibold", methodText(httpMethodOf(r)))}>
        {httpMethodOf(r)}
      </span>
      <span className="truncate">
        <span className="text-fg-subtle">{prefix}</span>
        {name}
      </span>
      <span className={isFailedState(r.status) ? "text-err" : "text-ok"}>
        {codeLabel(r, r.status)}
      </span>
      <span className="text-right text-fg-subtle">{formatClockTime(r.startedAt)}</span>
    </button>
  );
}

/**
 * One side of a comparison: the call it holds — its method, endpoint,
 * status, duration and time — opening a list of the newest calls to put in
 * its place.
 *
 * @param props - The side, its call, the calls to pick from, and what picks one
 * @returns The slot
 * @example
 * ```tsx
 * <RequestSlot side="a" request={a} candidates={calls} onPick={(id) => pick("a", id)} />
 * ```
 */
export function RequestSlot({
  side,
  request,
  candidates,
  onPick,
}: RequestSlotProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const { prefix, name } = endpointParts(request);
  const method = httpMethodOf(request);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Request ${side.toUpperCase()}: ${prefix}${name}`}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-dialog border bg-panel px-3.5 py-3 text-left text-fg hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand",
          open ? (side === "a" ? "border-brand" : "border-syntax-keyword") : "border-line",
        )}
      >
        <SideTag side={side} size="lg" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.75">
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn("shrink-0 font-mono text-meta font-semibold", methodText(method))}>
              {method}
            </span>
            <span className="truncate font-mono text-ui font-medium">
              <span className="text-fg-subtle">{prefix}</span>
              {name}
            </span>
          </span>
          <span className="flex items-center gap-2 font-mono text-badge text-fg-subtle">
            <Dot tone={STATE_META[request.status].tone} />
            {`${codeLabel(request, request.status)} · ${formatDuration(request.timing?.total ?? 0)} · ${formatClockTime(request.startedAt)}`}
          </span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-3.25 shrink-0 text-fg-subtle" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-85 w-(--radix-popover-trigger-width) overflow-auto rounded-dialog bg-panel p-1 shadow-overlay animate-pop-in"
        >
          {candidates.slice(0, LISTED).map((r) => (
            <Option
              key={r.id}
              r={r}
              chosen={r.id === request.id}
              onPick={() => {
                onPick(r.id);
                setOpen(false);
              }}
            />
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
