import { ArrowRight, Database, RadioTower, Shuffle, Tag } from "lucide-react";

import { urlParts } from "@/features/requests/request-parts";
import { isStreamRequest } from "@/features/requests/request-state";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";

const PROTOCOL = { http: "HTTP", sse: "Server-Sent Events", ws: "WebSocket" } as const;

/**
 * The request's URL, its parts coloured, over chips for its source, its
 * mode, its operation and its protocol.
 *
 * @param props - The request
 * @returns The box
 * @example
 * ```tsx
 * <UrlBox request={request} />
 * ```
 */
export function UrlBox({ request }: { request: RequestEntry }): React.ReactNode {
  const parts = urlParts(request.url);
  const stream = isStreamRequest(request);
  const proxy = request.mode === "proxy";
  return (
    <div className="flex flex-col gap-3 rounded-panel border border-line bg-inset px-3.5 py-3.25">
      {parts && (
        <p className="m-0 font-mono text-control leading-[1.65] [overflow-wrap:anywhere]">
          <span className="text-fg-subtle">{parts.origin}</span>
          <span className="text-fg">{parts.path}</span>
          {parts.query.map((param, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the query in the order it was written; a key may repeat
            <span key={i}>
              <span className="text-fg-subtle">{i === 0 ? "?" : "&"}</span>
              <span className="text-syntax-function">{param.key}</span>
              <span className="text-fg-subtle">=</span>
              <span className="text-syntax-string">{param.value}</span>
            </span>
          ))}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <UrlChip icon={Database}>{request.source}</UrlChip>
        <UrlChip icon={proxy ? Shuffle : ArrowRight} tone={proxy ? "text-syntax-type" : undefined}>
          {proxy ? "Proxy" : "Direct"}
        </UrlChip>
        {!stream && <UrlChip icon={Tag}>{request.type ?? "query"}</UrlChip>}
        <UrlChip icon={RadioTower} tone={stream ? "text-brand" : undefined}>
          {PROTOCOL[request.transport ?? "http"]}
        </UrlChip>
      </div>
    </div>
  );
}

function UrlChip({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof Database;
  tone?: string | undefined;
  children: string;
}): React.ReactNode {
  return (
    <span
      className={cn(
        "flex h-5.5 items-center gap-1.25 rounded-[6px] border border-line bg-panel px-2 text-label whitespace-nowrap",
        tone ?? "text-fg-muted",
      )}
    >
      <Icon aria-hidden="true" className="size-2.75" />
      {children}
    </span>
  );
}
