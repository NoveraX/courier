import { Clock, FileJson, KeyRound, Timer } from "lucide-react";

import { formatDuration } from "@/components/shared/formatters";
import { JsonTree } from "@/components/shared/json-tree";
import { KbdHint } from "@/components/shared/kbd-hint";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SegmentedControl } from "@/components/shared/segmented-control";

import { BreakdownCard, buildProxySegments, buildRequestSegments, computeProxyTotal } from "@/components/shared/timing-breakdown";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { FlowDiagram } from "@/components/shared/detail-panel/tabs/proxy-tab";
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
        <div className="mx-3 mt-2">
          <SegmentedControl
            options={RESPONSE_TABS.map((t) => ({ value: t.key, label: t.label, icon: t.icon }))}
            value={activeTab}
            onChange={onTabChange}
            iconSize="size-2.5"
          />
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
        <div className="flex items-center gap-1 text-caption tabular-nums text-muted-foreground">
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
