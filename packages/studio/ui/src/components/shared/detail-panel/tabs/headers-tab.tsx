import { HeadersSection } from "@/components/shared/headers-section";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";

interface HeadersTabProps {
  request: RequestEntry;
}

export function HeadersTab({ request }: HeadersTabProps): React.ReactElement {
  const runtimeKind = useStudioStore(
    (s) => s.bindingSnapshot.runtimes.find((r) => r.runtimeId === request.sessionId)?.kind,
  );
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
      {isDirect && <DirectModeNotice runtimeKind={runtimeKind} />}
      <HeadersSection title="Request Headers" headers={request.requestHeaders} />
      <HeadersSection title="Response Headers" headers={request.headers} />
      <MiddlewareHeadersSection headers={request.middlewareHeaders} />
    </div>
  );
}

/**
 * Notice shown for direct-mode requests explaining why the request headers
 * list is shorter than in proxy mode: what sends the request adds headers of
 * its own that Studio cannot see. In a browser the Fetch API hides them from
 * JavaScript by design; on a server the HTTP client adds them as it sends.
 * Which one sent it is the runtime's kind, unknown once the runtime is gone.
 */
function DirectModeNotice({
  runtimeKind,
}: {
  runtimeKind: "browser" | "server" | undefined;
}): React.ReactElement {
  return (
    <div className="rounded-md border border-border-subtle bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground/80">Direct mode</span> — only headers explicitly
      set by your code are listed here.{" "}
      {runtimeKind === "browser" ? (
        <>
          Browser-injected headers (<HeaderName>Cookie</HeaderName>,{" "}
          <HeaderName>User-Agent</HeaderName>, <HeaderName>Accept-Encoding</HeaderName>,{" "}
          <HeaderName>Sec-Fetch-*</HeaderName>, …) are not exposed to JavaScript by the Fetch API.
          Use the browser DevTools Network panel to inspect the full wire request.
        </>
      ) : runtimeKind === "server" ? (
        <>
          Headers the HTTP client adds as it sends (<HeaderName>User-Agent</HeaderName>,{" "}
          <HeaderName>Accept</HeaderName>, <HeaderName>Accept-Encoding</HeaderName>, …) are not.
        </>
      ) : (
        <>Headers the browser or the HTTP client adds as it sends are not.</>
      )}
    </div>
  );
}

function HeaderName({ children }: { children: string }): React.ReactElement {
  return (
    <code className="rounded bg-card/60 px-1 py-px font-mono text-[10px] text-muted-foreground/80">
      {children}
    </code>
  );
}

function MiddlewareHeadersSection({
  headers,
}: {
  headers?: Record<string, string[]> | undefined;
}): React.ReactElement | null {
  if (!headers || Object.keys(headers).length === 0) return null;

  const flat: Record<string, string> = {};
  for (const [key, values] of Object.entries(headers)) {
    flat[key] = values.join(", ");
  }

  return <HeadersSection title="Middleware Headers" headers={flat} />;
}
