import { useCallback, useRef, useState } from "react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MethodBadge } from "@/components/shared/method-badge";
import type { RequestEntry } from "@/store/types";
import { DETAIL_TABS } from "./constants";
import type { DetailTabKey } from "./constants";

import { GeneralTab } from "./tabs/general-tab";
import { SnippetsTab } from "./tabs/snippets-tab";
import { HeadersTab } from "./tabs/headers-tab";
import { PayloadTab } from "./tabs/payload-tab";
import { ResponseTab } from "./tabs/response-tab";
import { TimingTab } from "./tabs/timing-tab";
import { ErrorTab } from "./tabs/error-tab";
import { ProxyTab } from "./tabs/proxy-tab";

interface DetailPanelProps {
  request: RequestEntry;
  activeTab: DetailTabKey;
  onTabChange: (tab: DetailTabKey) => void;
  onClose: () => void;
  /** Hide Source and Mode rows in General tab (e.g. for mock logs) */
  hideSourceMode?: boolean;
}

export function DetailPanel({
  request,
  activeTab,
  onTabChange,
  onClose,
  hideSourceMode,
}: DetailPanelProps): React.ReactElement {
  const visibleTabs = getVisibleTabs(request);

  return (
    <div className="flex h-full flex-col border-l border-border-subtle bg-background">
      <PanelHeader request={request} onClose={onClose} />

      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as DetailTabKey)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <ScrollableTabs>
          <TabsList variant="line" className="h-9 w-max">
            {visibleTabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className={cn(
                "text-body-sm",
                tab.key === "error" && "text-rose-400/70 data-[state=active]:text-rose-400",
              )}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollableTabs>

        <div className="flex flex-1 flex-col min-h-0">
          <TabsContent value="general" className="mt-0 h-full overflow-auto">
            <GeneralTab request={request} hideSourceMode={hideSourceMode} />
          </TabsContent>
          <TabsContent value="snippets" className="mt-0 h-full overflow-auto">
            <SnippetsTab request={request} />
          </TabsContent>
          <TabsContent value="headers" className="mt-0 h-full overflow-auto">
            <HeadersTab request={request} />
          </TabsContent>
          <TabsContent value="payload" className="mt-0 h-full overflow-auto">
            <PayloadTab request={request} />
          </TabsContent>
          <TabsContent value="response" className="mt-0 h-full overflow-auto">
            <ResponseTab request={request} />
          </TabsContent>
          <TabsContent value="timing" className="mt-0 h-full overflow-auto">
            <TimingTab request={request} />
          </TabsContent>
          <TabsContent value="error" className="mt-0 h-full overflow-auto">
            <ErrorTab request={request} />
          </TabsContent>
          <TabsContent value="proxy" className="mt-0 h-full overflow-auto">
            <ProxyTab request={request} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function PanelHeader({
  request,
  onClose,
}: {
  request: RequestEntry;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-border-subtle px-3">
      <div className="flex items-center gap-2 min-w-0">
        <MethodBadge method={request.httpMethod ?? "GET"} />
        <span className="truncate mono-sm text-foreground">
          {request.group ? `${request.group}.` : ""}{request.method}
        </span>
      </div>
      <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close panel">
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

function getVisibleTabs(request: RequestEntry): typeof DETAIL_TABS[number][] {
  return DETAIL_TABS.filter((tab) => {
    if (tab.key === "error") return !!request.error;
    if (tab.key === "proxy") return request.mode === "proxy";
    return true;
  });
}

// ── Scrollable tabs with custom horizontal scrollbar ──────────────────────

function ScrollableTabs({ children }: { children: React.ReactNode }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const checkScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScroll({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  return (
    <ScrollAreaPrimitive.Root className="relative border-b border-border-subtle">
      <ScrollAreaPrimitive.Viewport
        ref={ref}
        className="overflow-x-auto overflow-y-hidden"
        onScroll={checkScroll}
        onMouseEnter={checkScroll}
      >
        <div className="px-3">{children}</div>
      </ScrollAreaPrimitive.Viewport>

      <ScrollAreaPrimitive.ScrollAreaScrollbar
        orientation="horizontal"
        className="flex h-1.5 touch-none select-none flex-col border-t border-t-transparent p-px transition-colors"
      >
        <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
      </ScrollAreaPrimitive.ScrollAreaScrollbar>

      {/* Fade edges */}
      <div className={cn(
        "pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-background to-transparent transition-opacity duration-150",
        canScroll.left ? "opacity-100" : "opacity-0",
      )} />
      <div className={cn(
        "pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-background to-transparent transition-opacity duration-150",
        canScroll.right ? "opacity-100" : "opacity-0",
      )} />
    </ScrollAreaPrimitive.Root>
  );
}
