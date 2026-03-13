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
    <div className="space-y-4 p-4">
      <Section title="Overview">
        <Row label="Status">
          <span className={status.text}>{status.label}</span>
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
          <Row label="Status Code">{request.statusCode}</Row>
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
          <Row label="Duration">{formatDuration(request.timing.total)}</Row>
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <h4 className="text-caption text-muted-foreground mb-2">{title}</h4>
      <div className="rounded-lg border border-border-subtle divide-y divide-border-subtle">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
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
