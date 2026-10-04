import { CopyButton } from "@/components/shared/copy-button";
import { formatDuration, formatSize, formatTimestamp } from "@/components/shared/formatters";
import { MethodBadge } from "@/components/shared/method-badge";
import { Badge } from "@/components/ui/badge";
import { useNow } from "@/hooks/use-tick";
import { describeUpload } from "@/lib/upload-progress";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import type { ValidationTarget } from "@/store/types-request";
import { STATUS_CONFIG } from "../constants";
import { DetailRow as Row, DetailSection as Section } from "../detail-rows";

interface GeneralTabProps {
  request: RequestEntry;
  /** Hide Source and Mode rows (e.g. for mock logs) */
  hideSourceMode?: boolean | undefined;
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
            {request.group ? `${request.group}.` : ""}
            {request.method}
          </code>
        </Row>
        {!hideSourceMode && (
          <>
            <Row label="Source">{request.source}</Row>
            <Row label="Mode">
              <Badge variant={request.mode === "proxy" ? "sky" : "secondary"}>{request.mode}</Badge>
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
        {request.middlewareCount > 0 && <Row label="Middleware">{request.middlewareCount}</Row>}
        {request.cache && <Row label="Cache">{cacheOutcome(request.cache)}</Row>}
        {request.upload && <Row label="Upload">{describeUpload(request.upload)}</Row>}
        <ValidationRow request={request} target="variables" label="Variables Validated" />
        <ValidationRow request={request} target="response" label="Response Validated" />
      </Section>
    </div>
  );
}

// ── Value renderers ───────────────────────────────────────────────────────

/* Whether the request was validated against a schema its endpoint declares:
   one that failed before its answer was read never checked the response. */
function ValidationRow({
  request,
  target,
  label,
}: {
  request: RequestEntry;
  target: ValidationTarget;
  label: string;
}): React.ReactElement | null {
  if (!request.hasValidation[target]) return null;
  const outcome = request.validated?.[target];
  if (!outcome && request.status === "pending") return null;
  const shown = outcome === "passed" ? "Passed" : outcome === "failed" ? "Failed" : "Not run";
  return <Row label={label}>{shown}</Row>;
}

function cacheOutcome(cache: NonNullable<RequestEntry["cache"]>): string {
  if (!cache.hit) return "Not in cache, fetched";
  return cache.age === undefined
    ? "Served from cache"
    : `Served from cache, stored ${formatDuration(cache.age)} before`;
}

function StatusCodePill({ code }: { code: number }): React.ReactElement {
  const styles =
    code >= 500
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
  const color =
    duration > 1000 ? "text-rose-400" : duration > 300 ? "text-amber-400" : "text-emerald-400";

  return (
    <span className={cn("mono-sm font-medium tabular-nums", color)}>
      {formatDuration(duration)}
    </span>
  );
}
