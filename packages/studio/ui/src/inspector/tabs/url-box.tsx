import { ArrowRight, Database, RadioTower, Shuffle, Tag, Webhook } from "lucide-react";

import { urlParts } from "@/features/requests/request-parts";
import { isStreamRequest } from "@/features/requests/request-state";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";

const PROTOCOL = { http: "HTTP", sse: "Server-Sent Events", ws: "WebSocket" } as const;

const MODE_CHIP = {
  direct: { icon: ArrowRight, label: "Direct", tone: undefined },
  proxy: { icon: Shuffle, label: "Proxy", tone: "text-syntax-type" },
  webhook: { icon: Webhook, label: "Webhook", tone: "text-syntax-keyword" },
} as const;

/**
 * The request's URL, its parts coloured, over chips for its source, its
 * mode, its operation — none for a webhook delivered to the app — and its
 * protocol.
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
  const mode = MODE_CHIP[request.mode];
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
        <UrlChip icon={mode.icon} tone={mode.tone}>
          {mode.label}
        </UrlChip>
        {!stream && request.mode !== "webhook" && (
          <UrlChip icon={Tag}>{request.type ?? "query"}</UrlChip>
        )}
        <UrlChip icon={RadioTower} tone={stream ? "text-brand" : undefined}>
          {stream ? PROTOCOL[request.transport ?? "http"] : (request.httpVersion ?? PROTOCOL.http)}
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
