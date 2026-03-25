import { X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MethodBadge } from "@/components/shared/method-badge";

import type { MockRouteEntry } from "@/store/mock-slice";

import { ExampleTab, GeneralTab, HandlerTab, SchemaTab } from "./route-detail-tabs";

interface RouteDetailProps {
  route: MockRouteEntry;
  serverUrl: string;
  sourceName: string;
  onClose: () => void;
}

export function RouteDetail({ route, serverUrl, sourceName, onClose }: RouteDetailProps): React.ReactElement {
  const navigate = useNavigate();
  const openInPlayground = () => {
    void navigate({ to: "/playground", search: { source: sourceName, group: route.group, method: route.endpoint } });
  };

  const hasSchema = route.responseSchema && Object.keys(route.responseSchema).length > 0;
  const hasExample = route.exampleResponse != null;

  return (
    <div className="flex h-full w-105 shrink-0 flex-col border-l border-border-subtle bg-background">
      {/* Header — matches Timeline detail panel */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border-subtle px-3">
        <div className="flex items-center gap-2 min-w-0">
          <MethodBadge method={route.httpMethod} />
          <span className="truncate mono-sm text-foreground">{route.fullPath}</span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close panel">
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Tabs — line variant like Timeline */}
      <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border-subtle">
          <div className="px-3">
            <TabsList variant="line" className="h-9 w-max">
              <TabsTrigger value="general" className="text-body-sm">General</TabsTrigger>
              <TabsTrigger value="schema" className="text-body-sm" disabled={!hasSchema}>Schema</TabsTrigger>
              <TabsTrigger value="example" className="text-body-sm" disabled={!hasExample}>Example</TabsTrigger>
              <TabsTrigger value="handler" className="text-body-sm">Handler</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="flex flex-1 flex-col min-h-0">
          <TabsContent value="general" className="mt-0 h-full overflow-auto">
            <GeneralTab route={route} serverUrl={serverUrl} onPlayground={openInPlayground} />
          </TabsContent>
          <TabsContent value="schema" className="mt-0 h-full overflow-auto">
            <SchemaTab schema={route.responseSchema} />
          </TabsContent>
          <TabsContent value="example" className="mt-0 h-full overflow-auto">
            <ExampleTab data={route.exampleResponse} />
          </TabsContent>
          <TabsContent value="handler" className="mt-0 h-full overflow-auto">
            <HandlerTab route={route} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
