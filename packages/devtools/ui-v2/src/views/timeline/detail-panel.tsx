import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MethodBadge } from "@/components/shared/method-badge";
import type { RequestEntry } from "@/store/types";
import { DETAIL_TABS } from "./constants";

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
  activeTab: string;
  onTabChange: (tab: string) => void;
  onClose: () => void;
}

export function DetailPanel({
  request,
  activeTab,
  onTabChange,
  onClose,
}: DetailPanelProps): React.ReactElement {
  const visibleTabs = getVisibleTabs(request);

  return (
    <div className="flex h-full flex-col border-l border-border-subtle bg-background">
      <PanelHeader request={request} onClose={onClose} />

      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="border-b border-border-subtle px-3">
          <TabsList variant="line" className="h-9">
            {visibleTabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className={cn(
                "text-body-sm",
                tab.key === "error" && "text-rose-400/70 data-[state=active]:text-rose-400",
              )}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex flex-1 flex-col min-h-0">
          <TabsContent value="general" className="mt-0 h-full overflow-auto">
            <GeneralTab request={request} />
          </TabsContent>
          <TabsContent value="snippets" className="mt-0 h-full overflow-hidden">
            <SnippetsTab request={request} />
          </TabsContent>
          <TabsContent value="headers" className="mt-0 h-full overflow-hidden">
            <HeadersTab request={request} />
          </TabsContent>
          <TabsContent value="payload" className="mt-0 h-full overflow-hidden">
            <PayloadTab request={request} />
          </TabsContent>
          <TabsContent value="response" className="mt-0 h-full overflow-hidden">
            <ResponseTab request={request} />
          </TabsContent>
          <TabsContent value="timing" className="mt-0 h-full overflow-auto">
            <TimingTab request={request} />
          </TabsContent>
          <TabsContent value="error" className="mt-0 h-full overflow-hidden">
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
