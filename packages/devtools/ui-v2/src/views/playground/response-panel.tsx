import { Clock, FileJson, KeyRound, Timer } from "lucide-react";

import { formatDuration } from "@/components/shared/formatters";
import { JsonTree } from "@/components/shared/json-tree";
import { KbdHint } from "@/components/shared/kbd-hint";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { BreakdownCard, buildProxySegments, buildRequestSegments, computeProxyTotal } from "@/components/shared/timing-breakdown";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { FlowDiagram } from "@/views/timeline/tabs/proxy-tab";
import { BodyMeta } from "./response-body-meta";
import { DroppedHeadersSection, HeadersSection } from "@/components/shared/headers-section";

// ── Types ──────────────────────────────────────────────────────────────────

interface ResponsePanelProps {
  entry: PlaygroundHistoryEntry | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const RESPONSE_TABS = [
  { key: "body", label: "Body", icon: FileJson },
  { key: "headers", label: "Headers", icon: KeyRound },
  { key: "timing", label: "Timing", icon: Timer },
];

// ── Component ──────────────────────────────────────────────────────────────

export function ResponsePanel({
  entry, activeTab, onTabChange,
}: ResponsePanelProps): React.ReactElement {
  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-body-sm text-muted-foreground/50">
          Send a request to see the response
        </p>
        <KbdHint keys="mod+enter" className="text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <StatusBar entry={entry} />

      <Tabs value={activeTab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
        <div className="mx-3 mt-2 inline-flex w-fit items-center gap-px rounded-lg border border-border-subtle bg-muted/60 p-0.5">
          {RESPONSE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                activeTab === t.key
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border-subtle"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              )}
            >
              <t.icon className="size-2.5" />
              {t.label}
            </button>
          ))}
        </div>

        <TabsContent value="body" className="mt-0 flex min-h-0 flex-1 flex-col p-3">
          {entry.response !== undefined
            ? <JsonTree data={entry.response} headerExtra={<BodyMeta data={entry.response} />} fill />
            : <EmptyTab message="No response body" />
          }
        </TabsContent>

        <TabsContent value="headers" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-3">
              <DroppedHeadersSection sent={entry.headers} forwarded={entry.requestHeaders} />
              <HeadersSection title="Request Headers" headers={entry.requestHeaders} />
              <HeadersSection title="Response Headers" headers={entry.responseHeaders} />
              {!entry.requestHeaders && !entry.responseHeaders && (
                <EmptyTab message="No headers" />
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="timing" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            {entry.timing ? (
              <div className="space-y-5 p-4">
                <BreakdownCard title="Request Timing" segments={buildRequestSegments(entry.timing)} total={entry.timing.total} />
                {entry.proxyTiming && (
                  <>
                    <FlowDiagram timing={entry.proxyTiming} />
                    <BreakdownCard
                      title="Proxy Timing"
                      segments={buildProxySegments(entry.proxyTiming)}
                      total={computeProxyTotal(entry.proxyTiming)}
                    />
                  </>
                )}
              </div>
            ) : (
              <EmptyTab message="No timing data" />
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyTab({ message }: { message: string }): React.ReactElement {
  return <p className="py-8 text-center text-body-sm text-muted-foreground/50">{message}</p>;
}

// ── Status bar ─────────────────────────────────────────────────────────────

function StatusBar({ entry }: { entry: PlaygroundHistoryEntry }): React.ReactElement {
  const isPending = entry.status === "pending";
  const isError = entry.status === "error";

  return (
    <div className="flex h-9 items-center gap-2 border-b border-border-subtle px-3">
      <Badge variant={isError ? "rose" : isPending ? "secondary" : "emerald"} className="text-[10px]">
        {isPending ? "Pending..." : entry.statusCode ?? (isError ? "Error" : "OK")}
      </Badge>
      {entry.duration !== undefined && (
        <div className="flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
          <Clock className="size-3" />
          {formatDuration(entry.duration)}
        </div>
      )}
      <div className="flex-1" />
      <span className="text-caption text-muted-foreground/50">
        {entry.group}.{entry.method}
      </span>
    </div>
  );
}
