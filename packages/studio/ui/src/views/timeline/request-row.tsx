import { Pin } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MethodBadge } from "@/components/shared/method-badge";
import { formatTimestamp } from "@/components/shared/formatters";
import { MetricsPill } from "@/components/shared/metrics-cells";
import { useStudioStore } from "@/store";
import { useNow } from "@/hooks/use-tick";
import { STATUS_CONFIG } from "./constants";
import { requestName } from "./request-name";

import type { RequestEntry } from "@/store/types";
import { describeUpload } from "@/lib/upload-progress";

interface RequestRowProps {
  request: RequestEntry;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function RequestRow({
  request,
  selected,
  onSelect,
}: RequestRowProps): React.ReactElement {
  const timestampFormat = useStudioStore((s) => s.settings.timestampFormat);
  const showPreview = useStudioStore((s) => s.settings.showRequestPreview);
  const now = useNow();
  const status = STATUS_CONFIG[request.status];
  const path = requestName(request);
  const verb = verbOf(request);

  return (
    <button
      type="button"
      className={cn(
        "group flex w-full items-center gap-3 px-3 text-left",
        "h-[var(--density-row-h)] transition-colors duration-75",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected && "bg-accent-brand/8 hover:bg-accent-brand/12",
        request.pinned && !selected && "bg-violet-500/5",
      )}
      onClick={() => onSelect(request.id)}
      data-request-id={request.id}
    >
      <span className={cn("size-2 shrink-0 rounded-full", status.dot)} />

      <span className="inline-flex w-[4.25rem] shrink-0 items-center">
        {/* A proxied call's verb is known once the proxy has read the call. */}
        {verb && <MethodBadge method={verb} />}
      </span>

      <span className="min-w-0 flex-1 truncate mono-sm text-foreground">
        {path}
      </span>

      {showPreview && (
        <>
          {request.cache?.hit && (
            <Badge variant="emerald" className="shrink-0 text-[9px] px-1.5 py-0">
              cache
            </Badge>
          )}
          <Badge
            variant={request.mode === "proxy" ? "sky" : "secondary"}
            className="shrink-0 text-[9px] px-1.5 py-0"
          >
            {request.mode}
          </Badge>

          {request.upload && request.status === "pending" && (
            <Badge
              variant="sky"
              className="shrink-0 text-[9px] px-1.5 py-0 tabular-nums"
              aria-label={`Upload ${describeUpload(request.upload)}`}
            >
              ↑ {request.upload.percentage}%
            </Badge>
          )}

          <MetricsPill statusCode={request.statusCode} duration={request.timing?.total} />
        </>
      )}

      <span className="inline-flex w-24 shrink-0 items-center justify-end mono-sm tabular-nums text-muted-foreground">
        {formatTimestamp(request.startedAt, timestampFormat, now)}
      </span>

      {request.pinned && (
        <Pin className="size-3 shrink-0 text-violet-400" />
      )}
    </button>
  );
}

/** The verb a request went out with; a stream is opened with a GET. */
function verbOf(request: RequestEntry): string | undefined {
  return request.httpMethod ?? (request.transport === "sse" ? "GET" : undefined);
}
