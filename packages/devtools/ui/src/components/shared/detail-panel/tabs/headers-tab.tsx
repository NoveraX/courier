import type { RequestEntry } from "@/store/types";
import { HeadersSection } from "@/components/shared/headers-section";

interface HeadersTabProps {
  request: RequestEntry;
}

export function HeadersTab({ request }: HeadersTabProps): React.ReactElement {
  if (!request.requestHeaders && !request.headers) {
    return (
      <p className="py-8 text-center text-body-sm text-muted-foreground">
        No headers captured
      </p>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <HeadersSection title="Request Headers" headers={request.requestHeaders} />
      <HeadersSection title="Response Headers" headers={request.headers} />
      <MiddlewareHeadersSection headers={request.middlewareHeaders} />
    </div>
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
