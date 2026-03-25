import { useMemo, useState } from "react";
import { Code2, Play, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JsonTree } from "@/components/shared/json-tree";
import { CodeBlock, FormatSwitcher } from "@/components/shared/code-block";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { DetailSection, DetailRow, DetailEmpty, QuickCopyRow } from "@/components/shared/detail-panel/detail-rows";
import { buildCurlSnippet, buildFetchSnippet } from "@/lib/snippets";
import { cn } from "@/lib/utils";

import type { MockRouteEntry } from "@/store/mock-slice";

// ── Snippet formats ───────────────────────────────────────────────────────────

const SNIPPET_FORMATS = [
  { key: "curl", label: "cURL", icon: Terminal },
  { key: "fetch", label: "fetch", icon: Code2 },
] as const;

type SnippetFormat = (typeof SNIPPET_FORMATS)[number]["key"];

// ── General Tab ───────────────────────────────────────────────────────────────

export function GeneralTab({ route, serverUrl, onPlayground }: {
  route: MockRouteEntry; serverUrl: string; onPlayground: () => void;
}): React.ReactElement {
  const [snippetFormat, setSnippetFormat] = useState<SnippetFormat>("curl");
  const url = `${serverUrl}${route.fullPath}`;
  const needsBody = route.httpMethod !== "GET" && route.httpMethod !== "DELETE";

  const snippet = useMemo(() => {
    const input = {
      url,
      method: route.httpMethod,
      body: needsBody ? (route.exampleResponse ?? { id: 1 }) : undefined,
    };
    return snippetFormat === "curl" ? buildCurlSnippet(input) : buildFetchSnippet(input);
  }, [snippetFormat, url, route.httpMethod, route.exampleResponse, needsBody]);

  return (
    <div className="space-y-5 p-4">
      <DetailSection title="Overview">
        <DetailRow label="Group">{route.group}</DetailRow>
        <DetailRow label="Endpoint"><span className="font-medium">{route.endpoint}</span></DetailRow>
        <DetailRow label="Source">
          <Badge variant={route.source === "auto" ? "secondary" : route.source === "override" ? "amber" : "violet"}>
            {route.source}
          </Badge>
        </DetailRow>
        <DetailRow label="Operation"><span className="font-mono">{inferOperation(route)}</span></DetailRow>
      </DetailSection>

      <DetailSection title="Metrics">
        <DetailRow label="Hits">
          <AnimatedCounter value={route.hits} className="text-h3 tabular-nums" />
        </DetailRow>
        <DetailRow label="Avg Latency">
          <LatencyValue ms={route.avgLatency} />
        </DetailRow>
      </DetailSection>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Snippet</h4>
          <FormatSwitcher
            formats={SNIPPET_FORMATS as unknown as { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[]}
            active={snippetFormat}
            onChange={(k) => setSnippetFormat(k as SnippetFormat)}
          />
        </div>
        <CodeBlock code={snippet} language={snippetFormat} />
      </div>

      <div>
        <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Quick Copy</h4>
        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <QuickCopyRow label="URL" value={url} />
          <QuickCopyRow label="Endpoint" value={`${route.group}.${route.endpoint}`} />
          <QuickCopyRow label="Path" value={route.fullPath} />
        </div>
      </div>

      <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={onPlayground}>
        <Play className="size-3" />
        Send test request
      </Button>
    </div>
  );
}

// ── Schema Tab ────────────────────────────────────────────────────────────────

export function SchemaTab({ schema }: { schema?: Record<string, string> }): React.ReactElement {
  if (!schema) return <DetailEmpty label="No schema available" />;

  return (
    <div className="space-y-5 p-4">
      <DetailSection title="Response Fields">
        {Object.entries(schema).map(([field, type]) => (
          <div key={field} className="flex items-center justify-between gap-4 px-3 py-2">
            <span className="font-mono text-body-sm text-violet-400/90">{field}</span>
            <Badge variant="secondary" className="text-[10px] font-mono">{type}</Badge>
          </div>
        ))}
      </DetailSection>
    </div>
  );
}

// ── Example Tab ───────────────────────────────────────────────────────────────

export function ExampleTab({ data }: { data: unknown }): React.ReactElement {
  if (data == null) return <DetailEmpty label="No example available" />;

  return (
    <div className="p-4">
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Auto-generated Response
      </h4>
      <JsonTree data={data} fill showCopy />
    </div>
  );
}

// ── Handler Tab ───────────────────────────────────────────────────────────────

export function HandlerTab({ route }: { route: MockRouteEntry }): React.ReactElement {
  const isAuto = route.source === "auto";

  return (
    <div className="space-y-5 p-4">
      <DetailSection title="Handler Info">
        <DetailRow label="Type">
          <Badge variant={isAuto ? "secondary" : "amber"}>
            {isAuto ? "Auto-generated" : "Custom override"}
          </Badge>
        </DetailRow>
        <DetailRow label="Operation"><span className="font-mono">{inferOperation(route)}</span></DetailRow>
      </DetailSection>

      <div className={cn(
        "rounded-lg border p-4",
        isAuto ? "border-border-subtle bg-muted/10" : "border-amber-500/20 bg-amber-500/5",
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            isAuto ? "bg-muted/30" : "bg-amber-500/10",
          )}>
            <Code2 className={cn("size-4", isAuto ? "text-muted-foreground" : "text-amber-400")} />
          </div>
          <p className="text-body-sm leading-relaxed text-foreground/80">
            {isAuto
              ? "This route is auto-generated from your API source definition. Override it by defining a custom handler in your mock server."
              : "This route uses a custom handler defined in your mock server configuration."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function LatencyValue({ ms }: { ms: number }): React.ReactElement {
  return (
    <span className={cn(
      "mono-sm tabular-nums font-medium",
      ms > 1000 ? "text-rose-400" : ms > 300 ? "text-amber-400" : ms > 0 ? "text-emerald-400" : "text-muted-foreground",
    )}>
      {ms > 0 ? `${ms}ms` : "—"}
    </span>
  );
}

function inferOperation(route: MockRouteEntry): string {
  const method = route.httpMethod.toUpperCase();
  const hasIdParam = route.fullPath.includes(":");
  if (method === "GET") return hasIdParam ? "getById" : "list";
  if (method === "POST") return "create";
  if (method === "PUT" || method === "PATCH") return "update";
  if (method === "DELETE") return "delete";
  return method.toLowerCase();
}
