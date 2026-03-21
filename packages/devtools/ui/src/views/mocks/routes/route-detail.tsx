import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/shared/copy-button";
import { MethodBadge } from "@/components/shared/method-badge";

import type { MockRouteEntry } from "@/store/mock-slice";

interface RouteDetailProps {
  route: MockRouteEntry;
  serverUrl: string;
  onClose: () => void;
}

export function RouteDetail({ route, serverUrl, onClose }: RouteDetailProps): React.ReactElement {
  const curlCmd = `curl -X ${route.httpMethod} ${serverUrl}${route.fullPath}`;

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border-subtle bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <MethodBadge method={route.httpMethod} />
        <span className="flex-1 truncate font-mono text-body-sm">{route.fullPath}</span>
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <Section label="Group">
          <span className="text-body-sm">{route.group}</span>
        </Section>

        <Section label="Endpoint">
          <span className="text-body-sm font-medium">{route.endpoint}</span>
        </Section>

        <Section label="Source">
          <Badge variant={route.source === "auto" ? "secondary" : route.source === "override" ? "amber" : "violet"}>
            {route.source}
          </Badge>
        </Section>

        <Section label="Hits">
          <span className="text-h3 tabular-nums">{route.hits}</span>
        </Section>

        <Section label="cURL">
          <div className="flex items-center gap-1 rounded-md bg-muted/30 px-2 py-1.5">
            <code className="flex-1 truncate text-mono-xs">{curlCmd}</code>
            <CopyButton value={curlCmd} label="Copy cURL" />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <span className="text-caption text-muted-foreground/70">{label}</span>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
