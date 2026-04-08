import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

import { PanelHeader } from "./panel-header";
import { OverviewTab } from "./tabs/overview-tab";
import { RequestsTab } from "./tabs/requests-tab";
import { SchemaTab } from "./tabs/schema-tab";
import { ConfigTab } from "./tabs/config-tab";
import { StreamTab } from "@/components/shared/detail-panel/tabs/stream-tab";

import { useEndpointMetrics } from "../use-endpoint-metrics";
import { useExplorerData } from "../use-explorer-data";
import type { EndpointNodeData } from "../types";

// ── Props ────────────────────────────────────────────────────────────────────

interface PanelContentProps {
  source: string;
  group: string;
  method: string;
  onNavigateToTimeline?: (requestId: string) => void;
  onOpenPlayground?: (source: string, group: string, method: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function PanelContent({
  source,
  group,
  method,
  onNavigateToTimeline,
  onOpenPlayground,
}: PanelContentProps): React.ReactElement {
  const detail = useEndpointMetrics(source, group, method);
  const data = useExplorerData();
  const endpoint = findEndpoint(data.endpoints, source, group, method);
  const transport = endpoint?.transport as "sse" | "ws" | undefined;
  const isRealtime = transport === "sse" || transport === "ws";
  const latestStream = isRealtime
    ? detail.recentRequests.find((r) => r.transport === transport && r.streamEvents?.length)
    : undefined;

  if (!endpoint) {
    return (
      <div className="flex items-center justify-center h-full text-body-sm text-muted-foreground/60">
        Endpoint not found
      </div>
    );
  }

  const handleCopyPath = (): void => {
    navigator.clipboard.writeText(endpoint.fullPath);
  };

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="sr-only">
        <SheetTitle>{endpoint.method}</SheetTitle>
        <SheetDescription>{endpoint.fullPath}</SheetDescription>
      </SheetHeader>

      {/* Header */}
      <div className="border-b border-border-subtle px-5 pt-5 pb-4">
        <PanelHeader
          endpoint={endpoint}
          onCopyPath={handleCopyPath}
          onOpenTimeline={() => onNavigateToTimeline?.(detail.recentRequests[0]?.id ?? "")}
          onOpenPlayground={() => onOpenPlayground?.(source, group, method)}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabsList variant="line" className="shrink-0 px-5 pt-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="requests">
            Requests
            {detail.recentRequests.length > 0 && (
              <span className="ml-1 text-muted-foreground/50 tabular-nums">
                {detail.recentRequests.length}
              </span>
            )}
          </TabsTrigger>
          {isRealtime && <TabsTrigger value="stream">Stream</TabsTrigger>}
          <TabsTrigger value="schema">Schema</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
          <div className="min-w-0 overflow-hidden p-5">
            <TabsContent value="overview">
              <OverviewTab detail={detail} />
            </TabsContent>
            <TabsContent value="requests">
              <RequestsTab
                requests={detail.recentRequests}
                onNavigateToTimeline={onNavigateToTimeline}
              />
            </TabsContent>
            {isRealtime && (
              <TabsContent value="stream">
                {latestStream
                  ? <StreamTab request={latestStream} />
                  : <p className="py-8 text-center text-body-sm text-muted-foreground/50">
                      No stream data yet — subscribe in Playground to capture events
                    </p>
                }
              </TabsContent>
            )}
            <TabsContent value="schema">
              <SchemaTab endpoint={endpoint} />
            </TabsContent>
            <TabsContent value="config">
              <ConfigTab endpoint={endpoint} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findEndpoint(
  endpoints: EndpointNodeData[],
  source: string,
  group: string,
  method: string,
): EndpointNodeData | undefined {
  return endpoints.find(
    (e) => e.source === source && e.group === group && e.method === method,
  );
}
