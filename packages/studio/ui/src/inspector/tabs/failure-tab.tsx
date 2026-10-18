import { Check, CircleAlert, Lightbulb, Minus, TriangleAlert, X } from "lucide-react";

import { CodeLines } from "@/design/code/code-lines";
import { tokenizeJsonLine } from "@/design/code/tokenize-json-line";
import type { FailureStage, FailureView } from "@/features/requests/request-failure";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";
import { FailureIssue } from "./failure-issue";

const SEVERITY = {
  warn: {
    card: "border-warn/30 bg-warn/7",
    mark: "bg-warn/16 text-warn",
    text: "text-warn",
    badge: "bg-warn/14 text-warn",
    icon: TriangleAlert,
  },
  err: {
    card: "border-err/30 bg-err/7",
    mark: "bg-err/16 text-err",
    text: "text-err",
    badge: "bg-err/14 text-err",
    icon: CircleAlert,
  },
} as const;

const STAGE = {
  ok: { box: "border-line bg-inset", text: "text-ok", icon: Check },
  err: { box: "border-err/35 bg-err-dim", text: "text-err", icon: X },
  skip: { box: "border-line bg-transparent", text: "text-fg-subtle", icon: Minus },
} as const;

/**
 * Why a request failed: the error and, for one that got no answer, what
 * the system said of it, where in Courier's pipeline it happened, the
 * schema issues with what arrived at each, what usually fixes it, and the
 * error as reported.
 *
 * @param props - The request, and what its failure comes to
 * @returns The tab
 * @example
 * ```tsx
 * <FailureTab request={request} failure={failureOf(request)} />
 * ```
 */
export function FailureTab({
  request,
  failure,
}: {
  request: RequestEntry;
  failure: FailureView;
}): React.ReactNode {
  const tone = SEVERITY[failure.severity];
  const Icon = tone.icon;
  const payload = request.validated?.variables === "failed" ? request.variables : request.data;
  return (
    <div className="flex flex-col gap-4.5 px-4.5 pt-4.5 pb-7">
      <div className={cn("flex gap-3.5 rounded-dialog border p-4", tone.card)}>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-panel",
            tone.mark,
          )}
        >
          <Icon aria-hidden="true" className="size-4.25" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("font-mono text-badge tracking-[0.05em]", tone.text)}>
              {failure.type}
            </span>
            {failure.code && (
              <span
                className={cn(
                  "flex h-4.5 items-center rounded-chip px-1.5 font-mono text-badge",
                  tone.badge,
                )}
              >
                {failure.code}
              </span>
            )}
          </div>
          <span className="text-prompt leading-[1.35] font-semibold text-pretty whitespace-pre-line">
            {failure.message}
          </span>
          {failure.cause && (
            <span className="font-mono text-small [overflow-wrap:anywhere] text-fg">
              {failure.cause}
            </span>
          )}
          <span className="text-small text-fg-muted">{failure.where}</span>
        </div>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-label font-semibold text-fg-muted">Where it failed</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {failure.stages.map((stage) => (
            <Stage key={stage.label} stage={stage} />
          ))}
        </div>
      </section>
      {failure.issues.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-label font-semibold text-fg-muted">Schema issues</h3>
          {failure.issues.map((issue, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a failure's issues in the order the schema reported them; two may share a path
            <FailureIssue key={i} issue={issue} payload={payload} />
          ))}
        </section>
      )}
      {failure.hint && (
        <div className="flex gap-2.75 rounded-panel border border-line bg-inset px-3.5 py-3.25">
          <Lightbulb aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warn" />
          <div className="flex flex-col gap-1">
            <span className="text-control font-semibold">Suggested fix</span>
            <span className="text-control leading-[1.55] text-pretty text-fg-muted">
              {failure.hint}
            </span>
          </div>
        </div>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-label font-semibold text-fg-muted">Raw error</h3>
        <div className="overflow-hidden rounded-panel border border-line bg-inset">
          <CodeLines variant="panel" code={failure.raw} tokenize={tokenizeJsonLine} />
        </div>
      </section>
    </div>
  );
}

function Stage({ stage }: { stage: FailureStage }): React.ReactNode {
  const { box, text, icon: Icon } = STAGE[stage.state];
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-[9px] border px-3 py-2.5", box)}>
      <span className={cn("flex items-center gap-1.5 text-small font-semibold", text)}>
        <Icon aria-hidden="true" className="size-3" />
        {stage.label}
      </span>
      <span className="font-mono text-badge text-fg-subtle">{stage.meta}</span>
    </div>
  );
}
