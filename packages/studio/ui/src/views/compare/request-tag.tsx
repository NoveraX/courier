import { X } from "lucide-react";
import { STATUS_CONFIG } from "@/components/shared/detail-panel/constants";
import { formatDuration } from "@/components/shared/formatters";
import { MethodBadge } from "@/components/shared/method-badge";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types-request";

interface RequestTagProps {
  request: RequestEntry;
  onClear: () => void;
  className?: string;
}

function buildPath(r: RequestEntry): string {
  const parts = [r.source];
  if (r.group) parts.push(r.group);
  parts.push(r.method);
  return parts.join(".");
}

export function RequestTag({ request, onClear, className }: RequestTagProps): React.ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-muted/40 px-2 py-1",
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_CONFIG[request.status].dot)} />
      <MethodBadge method={request.httpMethod ?? "GET"} />
      <span className="max-w-[180px] truncate font-mono text-[11px] text-foreground">
        {buildPath(request)}
      </span>
      {request.timing?.total != null && (
        <span className="text-[10px] text-muted-foreground">
          {formatDuration(request.timing.total)}
        </span>
      )}
      <button
        type="button"
        onClick={onClear}
        className="ml-0.5 rounded-sm p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Clear selection"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
