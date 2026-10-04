import { ArrowRight, Globe, Layers, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EndpointNodeData } from "../../types";

// ── Props ────────────────────────────────────────────────────────────────────

interface ConfigTabProps {
  endpoint: EndpointNodeData;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ConfigTab({ endpoint }: ConfigTabProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <ConfigSection icon={Route} title="Endpoint Type">
        <div className="flex items-center gap-2">
          <Badge variant={typeVariant(endpoint.endpointType)} className="text-[10px]">
            {kindOf(endpoint)}
          </Badge>
          <span className="text-body-xs text-muted-foreground/60">{kindDescription(endpoint)}</span>
        </div>
      </ConfigSection>

      <ConfigSection icon={ArrowRight} title="HTTP Method">
        <p className="text-body-xs text-muted-foreground">
          <span className="font-medium text-foreground">{endpoint.httpMethod}</span> &mdash;{" "}
          {methodNote(endpoint)}
        </p>
      </ConfigSection>

      <ConfigSection icon={Globe} title="Source">
        <p className="text-body-xs text-muted-foreground">
          <span className="font-medium text-foreground">{endpoint.source}</span> / {endpoint.group}
        </p>
        <p className="mt-1 text-mono-sm text-muted-foreground/60">{endpoint.fullPath}</p>
      </ConfigSection>

      <ConfigSection icon={Layers} title="Middleware">
        {(endpoint.middleware?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {endpoint.middleware?.map((mw, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the middleware chain in its order of execution; a name may repeat
              <Badge key={i} variant="secondary" className="text-[10px]">
                {mw}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-body-xs text-muted-foreground/50 italic">No middleware configured</p>
        )}
      </ConfigSection>
    </div>
  );
}

// ── Config Section ───────────────────────────────────────────────────────────

function ConfigSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-border-subtle bg-card/60 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-body-xs font-medium text-muted-foreground/70">
        <Icon className="size-3.5" />
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function typeVariant(t: string): "sky" | "amber" | "secondary" {
  if (t === "query") return "sky";
  if (t === "mutation") return "amber";
  return "secondary";
}

/* A stream or a channel is named by its transport, which its type leaves out. */
function kindOf(endpoint: EndpointNodeData): string {
  if (endpoint.transport === "sse") return "stream";
  if (endpoint.transport === "ws") return "channel";
  return endpoint.endpointType;
}

function kindDescription(endpoint: EndpointNodeData): string {
  if (endpoint.transport === "sse") return "Server-sent events the endpoint pushes to its caller";
  if (endpoint.transport === "ws") return "A WebSocket subscription";
  if (endpoint.endpointType === "query") return "Read-only data fetching endpoint";
  if (endpoint.endpointType === "mutation") return "Data mutation endpoint (create/update/delete)";
  return "Endpoint without explicit type annotation";
}

function methodNote(endpoint: EndpointNodeData): string {
  if (endpoint.transport === "sse") return "a stream opens with a GET";
  if (endpoint.transport === "ws") return "a channel opens with a WebSocket upgrade over GET";
  return "as the definition declares it";
}
