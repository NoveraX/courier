import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MethodBadge } from "@/components/shared/method-badge";
import { CopyButton } from "@/components/shared/copy-button";
import { formatDuration, formatTimestamp, formatSize } from "@/components/shared/formatters";
import type { RequestEntry } from "@/store/types";
import { useStudioStore } from "@/store";
import { useNow } from "@/hooks/use-tick";
import { STATUS_CONFIG } from "../constants";
import { DetailSection as Section, DetailRow as Row } from "../detail-rows";

interface GeneralTabProps {
  request: RequestEntry;
  /** Hide Source and Mode rows (e.g. for mock logs) */
  hideSourceMode?: boolean;
}

export function GeneralTab({ request, hideSourceMode }: GeneralTabProps): React.ReactElement {
  const timestampFormat = useStudioStore((s) => s.settings.timestampFormat);
  const now = useNow();
  const status = STATUS_CONFIG[request.status];

  return (
    <div className="space-y-5 p-4">
      <Section title="Overview">
        <Row label="Status">
          <div className="flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", status.dot)} />
            <span className={cn("text-body-sm font-medium", status.text)}>{status.label}</span>
          </div>
        </Row>
        <Row label="Method">
          <MethodBadge method={request.httpMethod ?? "GET"} />
        </Row>
        <Row label="Endpoint">
          <code className="mono-sm">
            {request.group ? `${request.group}.` : ""}{request.method}
          </code>
        </Row>
        {!hideSourceMode && (
          <>
            <Row label="Source">{request.source}</Row>
            <Row label="Mode">
              <Badge variant={request.mode === "proxy" ? "sky" : "secondary"}>
                {request.mode}
              </Badge>
            </Row>
          </>
        )}
        {request.type && <Row label="Type">{request.type}</Row>}
        {request.statusCode != null && request.statusCode > 0 && (
          <Row label="Status Code">
            <StatusCodePill code={request.statusCode} />
          </Row>
        )}
        {request.url && (
          <Row label="URL">
            <div className="flex items-center gap-1">
              <code className="truncate mono-sm">{request.url}</code>
              <CopyButton value={request.url} label="Copy URL" />
            </div>
          </Row>
        )}
      </Section>

      <Section title="Metrics">
        {request.timing?.total != null && (
          <Row label="Duration">
            <DurationValue duration={request.timing.total} />
          </Row>
        )}
        {request.size != null && request.size > 0 && (
          <Row label="Size">{formatSize(request.size)}</Row>
        )}
        <Row label="Started">{formatTimestamp(request.startedAt, timestampFormat, now)}</Row>
        {request.middlewareCount > 0 && (
          <Row label="Middleware">{request.middlewareCount}</Row>
        )}
        {request.hasValidation.variables && (
          <Row label="Variables Validated">Yes</Row>
        )}
        {request.hasValidation.response && (
          <Row label="Response Validated">Yes</Row>
        )}
      </Section>
    </div>
  );
}


// ── Value renderers ───────────────────────────────────────────────────────

function StatusCodePill({ code }: { code: number }): React.ReactElement {
  const styles = code >= 500
    ? "bg-fuchsia-500/10 text-fuchsia-400"
    : code >= 400
      ? "bg-rose-500/10 text-rose-400"
      : code >= 300
        ? "bg-amber-500/10 text-amber-400"
        : "bg-emerald-500/10 text-emerald-400";

  return (
    <span className={cn("mono-sm rounded-md px-1.5 py-0.5 font-medium tabular-nums", styles)}>
      {code}
    </span>
  );
}

function DurationValue({ duration }: { duration: number }): React.ReactElement {
  const color = duration > 1000
    ? "text-rose-400"
    : duration > 300
      ? "text-amber-400"
      : "text-emerald-400";

  return (
    <span className={cn("mono-sm font-medium tabular-nums", color)}>
      {formatDuration(duration)}
    </span>
  );
}
