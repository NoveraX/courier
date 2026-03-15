import { ScrollArea } from "@/components/ui/scroll-area";
import { CopyButton } from "@/components/shared/copy-button";
import type { RequestEntry } from "@/store/types";

interface HeadersTabProps {
  request: RequestEntry;
}

export function HeadersTab({ request }: HeadersTabProps): React.ReactElement {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {request.requestHeaders && Object.keys(request.requestHeaders).length > 0 && (
          <HeaderSection title="Request Headers" headers={request.requestHeaders} />
        )}

        {request.headers && Object.keys(request.headers).length > 0 && (
          <HeaderSection title="Response Headers" headers={request.headers} />
        )}

        {request.middlewareHeaders && Object.keys(request.middlewareHeaders).length > 0 && (
          <MiddlewareHeaderSection headers={request.middlewareHeaders} />
        )}

        {!request.requestHeaders && !request.headers && (
          <p className="py-8 text-center text-body-sm text-muted-foreground">
            No headers captured
          </p>
        )}
      </div>
    </ScrollArea>
  );
}

function HeaderSection({
  title,
  headers,
}: {
  title: string;
  headers: Record<string, string>;
}): React.ReactElement {
  const serialized = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{title}</h4>
        <CopyButton value={serialized} label={`Copy ${title.toLowerCase()}`} />
      </div>
      <div className="rounded-lg border border-border-subtle divide-y divide-border-subtle">
        {Object.entries(headers).map(([key, value]) => (
          <HeaderRow key={key} name={key} value={value} />
        ))}
      </div>
    </div>
  );
}

function MiddlewareHeaderSection({
  headers,
}: {
  headers: Record<string, string[]>;
}): React.ReactElement {
  return (
    <div>
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Middleware Headers</h4>
      <div className="rounded-lg border border-border-subtle divide-y divide-border-subtle">
        {Object.entries(headers).map(([key, values]) => (
          <HeaderRow key={key} name={key} value={values.join(", ")} />
        ))}
      </div>
    </div>
  );
}

function HeaderRow({
  name,
  value,
}: {
  name: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex gap-3 px-3 py-1.5">
      <span className="shrink-0 mono-sm font-medium text-violet-400">{name}</span>
      <span className="min-w-0 break-all mono-sm text-foreground">{value}</span>
    </div>
  );
}
