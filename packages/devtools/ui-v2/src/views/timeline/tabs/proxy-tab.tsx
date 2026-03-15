import { ArrowRight, Server, Monitor, Globe } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/shared/formatters";
import type { RequestEntry } from "@/store/types";
import { WaterfallBar } from "./proxy-waterfall";

interface ProxyTabProps {
  request: RequestEntry;
}

export function ProxyTab({ request }: ProxyTabProps): React.ReactElement {
  if (request.mode !== "proxy") {
    return (
      <p className="py-8 text-center text-body-sm text-muted-foreground">
        Direct mode — no proxy data
      </p>
    );
  }

  if (!request.proxyTiming) {
    return (
      <p className="py-8 text-center text-body-sm text-muted-foreground">
        No proxy timing data
      </p>
    );
  }

  const { clientToProxy, proxyToBackend, backendToProxy, proxyToClient } = request.proxyTiming;
  const serverTotal = proxyToBackend + backendToProxy;
  const hasClientTiming = clientToProxy > 0 || proxyToClient > 0;
  const totalRoundTrip = hasClientTiming ? clientToProxy + serverTotal + proxyToClient : undefined;

  return (
    <div className="space-y-6 p-4">
      {hasClientTiming && totalRoundTrip && totalRoundTrip > 0 && (
        <WaterfallBar
          clientToProxy={clientToProxy}
          proxyToBackend={proxyToBackend}
          backendToProxy={backendToProxy}
          proxyToClient={proxyToClient}
          total={totalRoundTrip}
        />
      )}

      <h4 className="text-caption text-muted-foreground">Proxy Flow</h4>

      <div className="flex items-center justify-center gap-2 py-4">
        <FlowNode icon={Monitor} label="Client" />
        <FlowArrow duration={hasClientTiming ? clientToProxy : undefined} label={hasClientTiming ? undefined : "network"} />
        <FlowNode icon={Server} label="Proxy" />
        <FlowArrow duration={proxyToBackend} />
        <FlowNode icon={Globe} label="Backend" />
      </div>

      <div className="flex items-center justify-center gap-2 py-4">
        <FlowNode icon={Globe} label="Backend" />
        <FlowArrow duration={backendToProxy} reverse />
        <FlowNode icon={Server} label="Proxy" />
        <FlowArrow duration={hasClientTiming ? proxyToClient : undefined} label={hasClientTiming ? undefined : "network"} reverse />
        <FlowNode icon={Monitor} label="Client" />
      </div>

      <div className="rounded-lg border border-border-subtle divide-y divide-border-subtle">
        {hasClientTiming && <ProxyRow label="Network Latency" value={clientToProxy} hint="round-trip" />}
        <ProxyRow label="Proxy Overhead" value={proxyToBackend} />
        <ProxyRow label="Backend Fetch" value={backendToProxy} />
        <ProxyRow label="Server Total" value={serverTotal} bold />
        {hasClientTiming && <ProxyRow label="Response Transfer" value={proxyToClient} />}
        {totalRoundTrip != null && <ProxyRow label="Total Round Trip" value={totalRoundTrip} bold />}
      </div>
    </div>
  );
}

function FlowNode({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex size-10 items-center justify-center rounded-lg border border-border-subtle bg-card">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <span className="text-body-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function FlowArrow({
  duration,
  label,
  reverse,
}: {
  duration?: number;
  label?: string;
  reverse?: boolean;
}): React.ReactElement {
  return (
    <div className={cn("flex flex-col items-center gap-0.5", reverse && "opacity-60")}>
      <ArrowRight className="size-4 text-muted-foreground" />
      <span className="mono-sm tabular-nums text-muted-foreground">
        {label ?? formatDuration(duration ?? 0)}
      </span>
    </div>
  );
}

function ProxyRow({
  label,
  value,
  bold,
  hint,
}: {
  label: string;
  value: number;
  bold?: boolean;
  hint?: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className={cn("text-body-sm text-muted-foreground", bold && "font-medium text-foreground")}>
        {label}
        {hint && <span className="ml-1 text-caption text-muted-foreground/60">({hint})</span>}
      </span>
      <span className={cn("mono-sm tabular-nums", bold ? "text-foreground font-medium" : "text-foreground")}>
        {formatDuration(value)}
      </span>
    </div>
  );
}
