import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RequestEntry } from "@/store/types";
import type { DetailTabKey } from "./constants";

import { GeneralTab } from "./tabs/general-tab";
import { SnippetsTab } from "./tabs/snippets-tab";
import { HeadersTab } from "./tabs/headers-tab";
import { PayloadTab } from "./tabs/payload-tab";
import { ResponseTab } from "./tabs/response-tab";
import { TimingTab } from "./tabs/timing-tab";
import { ErrorTab } from "./tabs/error-tab";
import { ProxyTab } from "./tabs/proxy-tab";
import { StreamTab } from "./tabs/stream-tab";
import { PanelHeader } from "./panel-header";
import { ScrollableTabs } from "./scrollable-tabs";
import { getVisibleTabs } from "./get-visible-tabs";

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
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className={cn(
                  "text-body-sm",
                  tab.key === "error" &&
                    "text-rose-400/70 data-[state=active]:text-rose-400",
                )}
              >
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
          <TabsContent value="stream" className="mt-0 h-full overflow-auto">
            <StreamTab request={request} />
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
