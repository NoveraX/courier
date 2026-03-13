import { AlertTriangle } from "lucide-react";

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

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-400" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-body-sm font-medium text-rose-400">{type}</span>
              {status && (
                <span className="mono-sm text-rose-400/70">{status}</span>
              )}
            </div>
            <p className="mt-1 text-body-sm text-foreground">{message}</p>
            <CopyButton value={message} label="Copy error" className="mt-1" />
          </div>
        </div>

        {validationIssues && validationIssues.length > 0 && (
          <ValidationIssues issues={validationIssues} />
        )}
      </div>
    </ScrollArea>
  );
}

function ValidationIssues({
  issues,
}: {
  issues: NonNullable<RequestEntry["error"]>["validationIssues"];
}): React.ReactElement | null {
  if (!issues) return null;

  return (
    <div>
      <h4 className="text-caption text-muted-foreground mb-2">
        Validation Issues ({issues.length})
      </h4>
      <div className="rounded-lg border border-border-subtle divide-y divide-border-subtle">
        {issues.map((issue, i) => (
          <div key={i} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <code className="mono-sm text-violet-400">{issue.path || "root"}</code>
              <span className="text-body-sm text-foreground">{issue.message}</span>
            </div>
            {(issue.expected || issue.received) && (
              <div className="mt-1 flex gap-4 mono-sm">
                {issue.expected && (
                  <span className="text-emerald-400">expected: {issue.expected}</span>
                )}
                {issue.received && (
                  <span className="text-rose-400">received: {issue.received}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
