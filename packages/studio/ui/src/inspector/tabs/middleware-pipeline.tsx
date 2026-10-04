import { Check, LoaderCircle, X } from "lucide-react";

import { middlewareSteps } from "@/features/requests/middleware-pipeline";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";

const STEP = {
  ok: { icon: Check, ring: "border-ok/35 bg-ok-dim text-ok" },
  err: { icon: X, ring: "border-err/40 bg-err-dim text-err" },
  running: { icon: LoaderCircle, ring: "border-warn/40 bg-warn-dim text-warn" },
} as const;

/**
 * The middleware chain a call went through, step by step: its phase, its
 * time, the headers it added, the error it threw.
 *
 * @param props - The request
 * @returns The section, or nothing for a call no middleware wrapped
 * @example
 * ```tsx
 * <MiddlewarePipeline request={request} />
 * ```
 */
export function MiddlewarePipeline({ request }: { request: RequestEntry }): React.ReactNode {
  const steps = middlewareSteps(request);
  if (steps.length === 0) return null;
  const overhead = request.timing?.middleware;
  const count = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h3 className="m-0 text-label font-semibold text-fg-muted">Middleware pipeline</h3>
        <span className="text-label text-fg-subtle">
          {overhead === undefined ? count : `${count} · ${formatDuration(overhead)} overhead`}
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col p-0">
        {steps.map((step, i) => {
          const { icon: Icon, ring } = STEP[step.state];
          const last = i === steps.length - 1;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: the chain in its order of execution; a middleware may run twice
            <li key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border",
                    ring,
                  )}
                >
                  <Icon aria-hidden="true" className="size-2.75" />
                </span>
                {!last && (
                  <span aria-hidden="true" className="min-h-2.5 w-px flex-1 bg-line-strong" />
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1.75 pt-0.5 pb-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-control font-medium">{step.name}</span>
                  {step.phase && (
                    <span className="flex h-4.5 items-center rounded-chip border border-line px-1.5 text-meta text-fg-subtle">
                      {step.phase}
                    </span>
                  )}
                  <span className="flex-1" />
                  {step.duration !== undefined && (
                    <span className="font-mono text-label text-fg-muted">
                      {formatDuration(step.duration)}
                    </span>
                  )}
                </div>
                {step.notes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {step.notes.map((note) => (
                      <span
                        key={note.text}
                        className={cn(
                          "flex h-5 items-center rounded-[5px] bg-raised px-1.75 font-mono text-badge",
                          note.tone === "err" ? "text-err" : "text-ok",
                        )}
                      >
                        {note.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
