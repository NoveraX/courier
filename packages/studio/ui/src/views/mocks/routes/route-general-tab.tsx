/**
 * "General" tab of the mock route detail panel — overview, metrics, snippet.
 * Owns the snippet format toggle (cURL / fetch) and the quick-copy section.
 */

import { Code2, Play, Terminal } from "lucide-react";
import { useMemo, useState } from "react";

import { AnimatedCounter } from "@/components/shared/animated-counter";
import { CodeBlock, FormatSwitcher } from "@/components/shared/code-block";
import {
  DetailRow,
  DetailSection,
  QuickCopyRow,
} from "@/components/shared/detail-panel/detail-rows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildCurlSnippet, buildFetchSnippet } from "@/lib/snippets";
import { cn } from "@/lib/utils";
import type { MockRouteEntry } from "@/store/mock-slice";
import { inferOperation, latencyColorClass } from "./route-detail-helpers";

const SNIPPET_FORMATS = [
  { key: "curl", label: "cURL", icon: Terminal },
  { key: "fetch", label: "fetch", icon: Code2 },
] as const;

type SnippetFormat = (typeof SNIPPET_FORMATS)[number]["key"];

interface GeneralTabProps {
  route: MockRouteEntry;
  serverUrl: string;
  onPlayground: () => void;
}

export function GeneralTab({
  route,
  serverUrl,
  onPlayground,
}: GeneralTabProps): React.ReactElement {
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
        <DetailRow label="Endpoint">
          <span className="font-medium">{route.endpoint}</span>
        </DetailRow>
        <DetailRow label="Source">
          <Badge
            variant={
              route.source === "auto"
                ? "secondary"
                : route.source === "override"
                  ? "amber"
                  : "violet"
            }
          >
            {route.source}
          </Badge>
        </DetailRow>
        <DetailRow label="Operation">
          <span className="font-mono">{inferOperation(route)}</span>
        </DetailRow>
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
          <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Snippet
          </h4>
          <FormatSwitcher
            formats={
              SNIPPET_FORMATS as unknown as {
                key: string;
                label: string;
                icon: React.ComponentType<{ className?: string }>;
              }[]
            }
            active={snippetFormat}
            onChange={(k) => setSnippetFormat(k as SnippetFormat)}
          />
        </div>
        <CodeBlock code={snippet} language={snippetFormat} />
      </div>

      <div>
        <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Quick Copy
        </h4>
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

function LatencyValue({ ms }: { ms: number }): React.ReactElement {
  return (
    <span className={cn("mono-sm tabular-nums font-medium", latencyColorClass(ms))}>
      {ms > 0 ? `${ms}ms` : "—"}
    </span>
  );
}
