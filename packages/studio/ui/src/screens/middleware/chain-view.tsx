import { PanelRight } from "lucide-react";

import { methodChip, methodText } from "@/design/method-color";
import { TONE_TEXT } from "@/design/tone";
import { traceOf } from "@/features/middleware/chain-trace";
import { codeLabel, endpointParts, httpMethodOf } from "@/features/requests/request-parts";
import { STATE_META } from "@/features/requests/request-state";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types-request";
import type { MiddlewareLook } from "./middleware-look";
import { PipelineSteps } from "./pipeline-steps";
import { TraceLanes } from "./trace-lanes";

/* How many of the newest traced calls the list offers. */
const LISTED = 30;

interface ChainViewProps {
  calls: readonly RequestEntry[];
  chosen: RequestEntry;
  looks: ReadonlyMap<string, MiddlewareLook>;
  onChoose: (id: string) => void;
  onInspect: (id: string) => void;
}

function Pick({
  r,
  on,
  onChoose,
}: {
  r: RequestEntry;
  on: boolean;
  onChoose: () => void;
}): React.ReactNode {
  const { name } = endpointParts(r);
  return (
    <button
      type="button"
      aria-current={on}
      onClick={onChoose}
      className={cn(
        "grid h-8.5 w-full cursor-pointer grid-cols-[36px_minmax(0,1fr)_36px_44px] items-center gap-2 rounded-[7px] px-2.5 text-left font-mono text-label hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand pointer-coarse:h-11",
        on && "bg-brand-dim",
      )}
    >
      <span className={cn("text-micro font-semibold", methodText(httpMethodOf(r)))}>
        {httpMethodOf(r)}
      </span>
      <span className={cn("truncate", on ? "text-fg" : "text-fg-muted")}>{name}</span>
      <span className={cn("text-right", TONE_TEXT[STATE_META[r.status].tone])}>
        {codeLabel(r, r.status)}
      </span>
      <span className="text-right text-fg-subtle">{formatDuration(r.timing?.middleware ?? 0)}</span>
    </button>
  );
}

/**
 * The chain inspector: the newest calls that ran through middleware to
 * pick from, and the one picked traced — its lanes against its time, and
 * its pipeline step by step — with a way into the inspector. Where the two
 * stack, a phone keeps the list short, so the chain shows under it.
 *
 * @param props - The calls, the one picked, the middleware's looks, and what picks and inspects
 * @returns The view
 * @example
 * ```tsx
 * <ChainView calls={calls} chosen={calls[0]} looks={looks} onChoose={pick} onInspect={open} />
 * ```
 */
export function ChainView({
  calls,
  chosen,
  looks,
  onChoose,
  onInspect,
}: ChainViewProps): React.ReactNode {
  const trace = traceOf(chosen);
  const { prefix, name } = endpointParts(chosen);
  const method = httpMethodOf(chosen);
  return (
    <div className="grid grid-cols-1 items-start gap-4 min-[1000px]:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
      <section
        aria-label="Calls"
        className="flex max-h-[calc(100dvh-170px)] flex-col overflow-hidden rounded-sheet border border-line bg-panel max-sm:max-h-75 min-[1000px]:sticky min-[1000px]:top-0"
      >
        <div className="flex h-11.5 shrink-0 items-center gap-2 border-b border-line px-3.5">
          <h2 className="m-0 text-ui font-semibold">Calls</h2>
          <span className="text-label text-fg-subtle">pick one to trace</span>
        </div>
        <div className="overflow-auto p-1">
          {calls.slice(0, LISTED).map((r) => (
            <Pick key={r.id} r={r} on={r.id === chosen.id} onChoose={() => onChoose(r.id)} />
          ))}
        </div>
      </section>
      <section
        aria-label="Chain"
        className="flex min-w-0 flex-col overflow-hidden rounded-sheet border border-line bg-panel"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4.5 py-4">
          <span
            className={cn(
              "flex h-5.5 items-center rounded-[6px] px-1.75 font-mono text-meta font-semibold",
              methodChip(method),
            )}
          >
            {method}
          </span>
          <span className="min-w-0 truncate font-mono text-heading font-medium">
            <span className="text-fg-subtle">{prefix}</span>
            {name}
          </span>
          <div className="flex-1" />
          <span className="flex items-center gap-1.5 text-small text-fg-muted">
            <span className={TONE_TEXT[STATE_META[chosen.status].tone]}>
              {STATE_META[chosen.status].label}
            </span>{" "}
            ·<span className="font-mono">{formatDuration(chosen.timing?.total ?? 0)}</span>
          </span>
          <button
            type="button"
            onClick={() => onInspect(chosen.id)}
            className="flex h-7 cursor-pointer items-center gap-1.5 rounded-control border border-line px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-9"
          >
            <PanelRight aria-hidden="true" className="size-3" />
            Inspect
          </button>
        </div>
        <TraceLanes trace={trace} looks={looks} />
        <PipelineSteps trace={trace} request={chosen} looks={looks} />
      </section>
    </div>
  );
}
