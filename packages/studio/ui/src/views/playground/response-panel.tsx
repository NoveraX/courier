import { FileJson, KeyRound } from "lucide-react";

import { JsonTree } from "@/components/shared/json-tree";
import { KbdHint } from "@/components/shared/kbd-hint";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";

import { FlowDiagram } from "@/components/shared/detail-panel/tabs/proxy-tab";
import { DroppedHeadersSection, HeadersSection } from "@/components/shared/headers-section";
import { StreamTimingSummary } from "@/components/shared/stream-timing-summary";
import { BreakdownCard, buildProxySegments, buildRequestSegments, computeProxyTotal } from "@/components/shared/timing-breakdown";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { BodyMeta } from "./response-body-meta";
import { StatusBar } from "./response-status-bar";
import { StreamEventsTab } from "./stream-events-tab";

// ── Types ──────────────────────────────────────────────────────────────────

interface ResponsePanelProps {
  entry: PlaygroundHistoryEntry | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const HTTP_TABS = [
  { key: "body", label: "Body", icon: FileJson },
  { key: "headers", label: "Headers", icon: KeyRound },
  { key: "timing", label: "Timing", icon: undefined },
];

const STREAM_TABS = [
  { key: "stream", label: "Stream", icon: undefined },
  { key: "headers", label: "Headers", icon: KeyRound },
  { key: "timing", label: "Timing", icon: undefined },
];

// ── Component ──────────────────────────────────────────────────────────────

export function ResponsePanel({
  entry, activeTab, onTabChange,
}: ResponsePanelProps): React.ReactElement {
  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-body-sm text-muted-foreground/50">Send a request to see the response</p>
        <KbdHint keys="mod+enter" className="text-muted-foreground/40" />
      </div>
    );
  }

  const isStream = entry.transport === "sse" || entry.transport === "ws";
  const tabs = isStream ? STREAM_TABS : HTTP_TABS;
  const validKeys = tabs.map((t) => t.key);
  const safeTab = validKeys.includes(activeTab) ? activeTab : (validKeys[0] ?? activeTab);

  // Every field reads from the playground entry directly — the rid-keyed
  // wire folds chunk/end/error reducers into the same entry slice, so
  // there is no secondary RequestEntry lookup tied to a separate
  // server-assigned correlation id.
  const requestHeaders = entry.requestHeaders;
  const responseHeaders = entry.responseHeaders;
  const timing = entry.timing;
  const proxyTiming = entry.proxyTiming;
  const duration = entry.duration;
  const streamEventCount = entry.chunks?.length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <StatusBar entry={entry} />

      <Tabs value={safeTab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
        <div className="mx-3 mt-2">
          <SegmentedControl
            options={tabs.map((t) => ({ value: t.key, label: t.label, icon: t.icon }))}
            value={safeTab}
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

        <TabsContent value="stream" className="mt-0 flex min-h-0 flex-1 flex-col">
          <StreamEventsTab entry={entry} />
        </TabsContent>

        <TabsContent value="headers" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-3">
              {/* allowedHeaders filters what a proxy forwards; a direct call sends every header. */}
              <DroppedHeadersSection
                sent={entry.headers}
                forwarded={entry.mode === "proxy" ? requestHeaders : undefined}
              />
              <HeadersSection title="Request Headers" headers={requestHeaders} />
              <HeadersSection title="Response Headers" headers={responseHeaders} />
              {!requestHeaders && !responseHeaders && (
                <EmptyTab message={isStream ? "No headers captured for realtime streams" : "No headers"} />
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="timing" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-3">
              {timing ? (
                <>
                  <BreakdownCard title="Request Timing" segments={buildRequestSegments(timing)} total={timing.total} />
                  {proxyTiming && (
                    <>
                      <FlowDiagram timing={proxyTiming} />
                      <BreakdownCard title="Proxy Timing" segments={buildProxySegments(proxyTiming)} total={computeProxyTotal(proxyTiming)} />
                    </>
                  )}
                </>
              ) : isStream && entry.streamStatus === "complete" ? (
                <StreamTimingSummary data={{
                  duration,
                  eventCount: streamEventCount,
                  totalBytes: undefined,
                  transport: entry.transport,
                }} />
              ) : (
                <EmptyTab message={isStream ? "Timing available after stream closes" : "No timing data"} />
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyTab({ message }: { message: string }): React.ReactElement {
  return <p className="py-8 text-center text-body-sm text-muted-foreground/50">{message}</p>;
}
