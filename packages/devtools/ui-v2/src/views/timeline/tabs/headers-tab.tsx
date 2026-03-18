import { ScrollArea } from "@/components/ui/scroll-area";
import type { RequestEntry } from "@/store/types";
import { HeadersSection } from "@/components/shared/headers-section";

interface HeadersTabProps {
  request: RequestEntry;
}

export function HeadersTab({ request }: HeadersTabProps): React.ReactElement {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <HeadersSection title="Request Headers" headers={request.requestHeaders} />
        <HeadersSection title="Response Headers" headers={request.headers} />
        <MiddlewareHeadersSection headers={request.middlewareHeaders} />

        {!request.requestHeaders && !request.headers && (
          <p className="py-8 text-center text-body-sm text-muted-foreground">
            No headers captured
          </p>
        )}
      </div>
    </ScrollArea>
  );
}

function MiddlewareHeadersSection({ headers }: {
  headers?: Record<string, string[]>;
}): React.ReactElement | null {
  if (!headers || Object.keys(headers).length === 0) return null;

  const flat: Record<string, string> = {};
  for (const [key, values] of Object.entries(headers)) {
    flat[key] = values.join(", ");
  }

  return <HeadersSection title="Middleware Headers" headers={flat} />;
}
