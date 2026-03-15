import { AlertTriangle, ShieldAlert, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CopyButton } from "@/components/shared/copy-button";
import type { RequestEntry } from "@/store/types";

interface ErrorTabProps {
  request: RequestEntry;
}

export function ErrorTab({ request }: ErrorTabProps): React.ReactElement {
  if (!request.error) {
    return (
      <p className="py-8 text-center text-body-sm text-muted-foreground">
        No errors
      </p>
    );
  }

  const { type, message, status, validationIssues } = request.error;
  const isCritical = status != null && status >= 500;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <ErrorCard type={type} message={message} status={status} critical={isCritical} />
        {validationIssues && validationIssues.length > 0 && (
          <ValidationIssues issues={validationIssues} />
        )}
      </div>
    </ScrollArea>
  );
}

// ── Error card ────────────────────────────────────────────────────────────

function ErrorCard({ type, message, status, critical }: {
  type: string;
  message: string;
  status?: number;
  critical: boolean;
}): React.ReactElement {
  const Icon = critical ? ShieldAlert : XCircle;

  return (
    <div className={cn(
      "rounded-lg border p-4",
      critical
        ? "border-fuchsia-500/20 bg-fuchsia-500/5"
        : "border-rose-500/20 bg-rose-500/5",
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          critical ? "bg-fuchsia-500/10" : "bg-rose-500/10",
        )}>
          <Icon className={cn("size-4", critical ? "text-fuchsia-400" : "text-rose-400")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              "text-body-sm font-semibold",
              critical ? "text-fuchsia-400" : "text-rose-400",
            )}>
              {type}
            </span>
            <div className="flex items-center gap-1.5">
              {status && (
                <span className={cn(
                  "mono-sm rounded-md px-1.5 py-0.5 font-medium tabular-nums",
                  critical
                    ? "bg-fuchsia-500/10 text-fuchsia-400"
                    : "bg-rose-500/10 text-rose-400",
                )}>
                  {status}
                </span>
              )}
              <CopyButton value={message} label="Copy error" />
            </div>
          </div>
          <p className="mt-1.5 text-body-sm leading-relaxed text-foreground/80">{message}</p>
        </div>
      </div>
    </div>
  );
}

// ── Validation issues ─────────────────────────────────────────────────────

function ValidationIssues({
  issues,
}: {
  issues: NonNullable<RequestEntry["error"]>["validationIssues"];
}): React.ReactElement | null {
  if (!issues) return null;

  return (
    <div>
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Validation Issues
        <span className="ml-1.5 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] tabular-nums text-rose-400">
          {issues.length}
        </span>
      </h4>
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        {issues.map((issue, i) => (
          <div key={i} className="border-b border-border-subtle px-3 py-2.5 last:border-b-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-3 shrink-0 text-amber-400" />
              <code className="mono-sm font-medium text-violet-400">{issue.path || "root"}</code>
              <span className="text-body-sm text-foreground/80">{issue.message}</span>
            </div>
            {(issue.expected || issue.received) && (
              <div className="mt-1.5 ml-5 flex gap-4 mono-sm">
                {issue.expected && (
                  <span className="text-emerald-400">
                    <span className="text-muted-foreground/50">expected </span>
                    {issue.expected}
                  </span>
                )}
                {issue.received && (
                  <span className="text-rose-400">
                    <span className="text-muted-foreground/50">received </span>
                    {issue.received}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
