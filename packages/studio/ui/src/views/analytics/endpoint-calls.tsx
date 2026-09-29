import { ExternalLink } from "lucide-react";
import { STATUS_CONFIG } from "@/components/shared/detail-panel";
import { formatDuration, formatSize } from "@/components/shared/formatters";
import { TableCell, TableRow } from "@/components/ui/table";
import { useRequestDetail } from "@/hooks/use-request-detail";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";

// ── Props ────────────────────────────────────────────────────────────────────

interface EndpointCallsProps {
  requestIds: string[];
  requestsMap: Map<string, RequestEntry>;
}

// ── Component ────────────────────────────────────────────────────────────────

export function EndpointCalls({ requestIds, requestsMap }: EndpointCallsProps): React.ReactElement {
  const { selectRequest } = useRequestDetail();

  function handleClick(id: string): void {
    selectRequest(id);
  }

  return (
    <>
      {requestIds.map((id) => {
        const req = requestsMap.get(id);
        if (!req) return null;
        return <CallRow key={id} request={req} onClick={() => handleClick(id)} />;
      })}
    </>
  );
}

// ── Call Row ─────────────────────────────────────────────────────────────────

function CallRow({
  request,
  onClick,
}: {
  request: RequestEntry;
  onClick: () => void;
}): React.ReactElement {
  const status = STATUS_CONFIG[request.status];
  const time = new Date(request.startedAt).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <TableRow
      className="cursor-pointer border-border-subtle bg-muted/30 hover:bg-muted/60"
      onClick={onClick}
    >
      <TableCell className="pl-8">
        <span className="flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full shrink-0", status.dot)} />
          <span className="mono-sm text-muted-foreground">{time}</span>
        </span>
      </TableCell>
      <TableCell className={cn("text-right mono-sm tabular-nums", status.text)}>
        {request.statusCode ?? "—"}
      </TableCell>
      <TableCell className="text-right mono-sm tabular-nums text-muted-foreground">
        {request.timing ? formatDuration(request.timing.total) : "—"}
      </TableCell>
      <TableCell />
      <TableCell />
      <TableCell />
      <TableCell className="text-right mono-sm tabular-nums text-muted-foreground">
        {request.size ? formatSize(request.size) : "—"}
      </TableCell>
      <TableCell className="text-right">
        <ExternalLink className="ml-auto size-3 text-muted-foreground/50" />
      </TableCell>
    </TableRow>
  );
}
