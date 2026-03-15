import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MethodBadge } from "@/components/shared/method-badge";
import { CopyButton } from "@/components/shared/copy-button";
import { formatDuration, formatAbsoluteTime, formatSize } from "@/components/shared/formatters";
import type { RequestEntry } from "@/store/types";
import { STATUS_CONFIG } from "../constants";

interface GeneralTabProps {
  request: RequestEntry;
}

export function GeneralTab({ request }: GeneralTabProps): React.ReactElement {
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
        <Row label="Source">{request.source}</Row>
        <Row label="Mode">
          <Badge variant={request.mode === "proxy" ? "sky" : "secondary"}>
            {request.mode}
          </Badge>
        </Row>
        {request.type && <Row label="Type">{request.type}</Row>}
        {request.statusCode && (
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
        {request.size != null && (
          <Row label="Size">{formatSize(request.size)}</Row>
        )}
        <Row label="Started">{formatAbsoluteTime(request.startedAt)}</Row>
        <Row label="Middleware">{request.middlewareCount}</Row>
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

// ── Layout helpers ────────────────────────────────────────────────────────

function Section({ title, children }: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{title}</h4>
      <div className="rounded-lg border border-border-subtle divide-y divide-border-subtle">
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <span className="shrink-0 text-body-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-body-sm text-foreground">{children}</span>
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
