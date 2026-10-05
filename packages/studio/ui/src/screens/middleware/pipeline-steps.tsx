import { Check, Globe, X } from "lucide-react";

import type { ChainTrace, TraceStep } from "@/features/middleware/chain-trace";
import { pathOf } from "@/features/requests/request-parts";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types-request";
import type { MiddlewareLook } from "./middleware-look";

interface Row {
  key: string;
  name: string;
  phase: string;
  duration: number;
  note: string;
  failed: boolean;
  fetch: boolean;
  headers: string[];
}

function rowOf(step: TraceStep, place: number, look: MiddlewareLook | undefined): Row {
  return {
    key: `${place}-${step.name}`,
    name: step.name,
    phase: step.phase,
    duration: step.duration,
    note: step.failed ? (step.error ?? "Failed") : (look?.description ?? ""),
    failed: step.failed,
    fetch: false,
    headers: step.headersAdded,
  };
}

/* The fetch comes after every middleware that works before it, before the ones that work only after
   — when the call got that far. */
function rowsOf(
  trace: ChainTrace,
  r: RequestEntry,
  looks: ReadonlyMap<string, MiddlewareLook>,
): Row[] {
  const rows = trace.steps.map((step, place) => rowOf(step, place, looks.get(step.name)));
  if (!trace.reachedFetch) return rows;
  const at = trace.steps.filter((step) => step.phase !== "after").length;
  const code = r.statusCode ?? (r.status === "aborted" ? "aborted" : "no response");
  rows.splice(at, 0, {
    key: "fetch",
    name: "fetch",
    phase: "network",
    duration: r.timing?.fetch ?? 0,
    note: `${r.httpMethod ?? "GET"} ${pathOf(r.url)} → ${code}`,
    failed: false,
    fetch: true,
    headers: [],
  });
  return rows;
}

/**
 * A call's pipeline, step by step: each middleware — whether it went
 * through, its phase and time, what it does or how it failed, and the
 * headers it added — with the fetch in its place among them, when the call
 * got that far.
 *
 * @param props - The trace, the call, and the middleware's looks
 * @returns The steps
 * @example
 * ```tsx
 * <PipelineSteps trace={traceOf(request)} request={request} looks={looks} />
 * ```
 */
export function PipelineSteps({
  trace,
  request,
  looks,
}: {
  trace: ChainTrace;
  request: RequestEntry;
  looks: ReadonlyMap<string, MiddlewareLook>;
}): React.ReactNode {
  const rows = rowsOf(trace, request, looks);
  return (
    <div className="flex flex-col px-4.5 pt-2.5 pb-5">
      <h3 className="m-0 pt-1.5 pb-2.5 text-label font-semibold text-fg-muted">Pipeline</h3>
      <ol aria-label="Pipeline" className="m-0 flex list-none flex-col p-0">
        {rows.map((row, i) => {
          const Icon = row.fetch ? Globe : row.failed ? X : Check;
          return (
            <li key={row.key} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5">
              <span className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border",
                    row.fetch
                      ? "border-line-strong bg-raised text-fg-muted"
                      : row.failed
                        ? "border-err/40 bg-err-dim text-err"
                        : "border-ok/35 bg-ok-dim text-ok",
                  )}
                >
                  <Icon aria-hidden="true" className="size-3" />
                </span>
                {i < rows.length - 1 && <span className="min-h-3 w-px flex-1 bg-line-strong" />}
              </span>
              <span className="flex min-w-0 flex-col gap-2 pt-0.75 pb-4.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-ui font-semibold">{row.name}</span>
                  <span className="flex h-4.75 items-center rounded-chip border border-line px-1.5 text-meta text-fg-subtle">
                    {row.phase}
                  </span>
                  <span className="flex-1" />
                  <span className="font-mono text-label text-fg-muted">
                    {formatDuration(row.duration)}
                  </span>
                </span>
                <span className={cn("text-small", row.failed ? "text-err" : "text-fg-subtle")}>
                  {row.note}
                </span>
                {row.headers.length > 0 && (
                  <span className="flex flex-wrap gap-1.5">
                    {row.headers.map((header) => (
                      <span
                        key={header}
                        className="flex h-5.25 items-center rounded-[5px] bg-ok-dim px-1.75 font-mono text-badge text-ok"
                      >{`+ ${header}`}</span>
                    ))}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
