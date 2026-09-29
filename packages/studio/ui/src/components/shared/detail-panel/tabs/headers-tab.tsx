import { HeadersSection } from "@/components/shared/headers-section";
import type { RequestEntry } from "@/store/types";

interface HeadersTabProps {
  request: RequestEntry;
}

export function HeadersTab({ request }: HeadersTabProps): React.ReactElement {
  const isStream = request.transport === "sse" || request.transport === "ws";
  const isDirect = request.mode === "direct";
  const requestHeadersCount = request.requestHeaders
    ? Object.keys(request.requestHeaders).length
    : 0;
  const responseHeadersCount = request.headers ? Object.keys(request.headers).length : 0;
  const middlewareHeadersCount = request.middlewareHeaders
    ? Object.keys(request.middlewareHeaders).length
    : 0;
  const hasHeaders = requestHeadersCount + responseHeadersCount + middlewareHeadersCount > 0;

  if (!hasHeaders && !isDirect) {
    return (
      <p className="py-8 text-center text-body-sm text-muted-foreground">
        {isStream ? "No headers captured for realtime streams" : "No headers captured"}
      </p>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {isDirect && <DirectModeNotice />}
      <HeadersSection title="Request Headers" headers={request.requestHeaders} />
      <HeadersSection title="Response Headers" headers={request.headers} />
      <MiddlewareHeadersSection headers={request.middlewareHeaders} />
    </div>
  );
}

/**
 * Notice shown for direct-mode requests explaining why the request headers
 * list is shorter than in proxy mode. The browser injects most headers
 * (Cookie, User-Agent, Accept-Encoding, Sec-Fetch-*, etc.) automatically
 * and Fetch API does not expose them to JavaScript by design — there is
 * no way for Studio to capture them client-side.
 */
function DirectModeNotice(): React.ReactElement {
  return (
    <div className="rounded-md border border-border-subtle bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground/80">Direct mode</span> — only headers explicitly
      set by your code are listed here. Browser-injected headers (
      <code className="rounded bg-card/60 px-1 py-px font-mono text-[10px] text-muted-foreground/80">
        Cookie
      </code>
      ,{" "}
      <code className="rounded bg-card/60 px-1 py-px font-mono text-[10px] text-muted-foreground/80">
        User-Agent
      </code>
      ,{" "}
      <code className="rounded bg-card/60 px-1 py-px font-mono text-[10px] text-muted-foreground/80">
        Accept-Encoding
      </code>
      ,{" "}
      <code className="rounded bg-card/60 px-1 py-px font-mono text-[10px] text-muted-foreground/80">
        Sec-Fetch-*
      </code>
      , …) are not exposed to JavaScript by the Fetch API. Use the browser DevTools Network panel to
      inspect the full wire request.
    </div>
  );
}

function MiddlewareHeadersSection({
  headers,
}: {
  headers?: Record<string, string[]>;
}): React.ReactElement | null {
  if (!headers || Object.keys(headers).length === 0) return null;

  const flat: Record<string, string> = {};
  for (const [key, values] of Object.entries(headers)) {
    flat[key] = values.join(", ");
  }

  return <HeadersSection title="Middleware Headers" headers={flat} />;
}
