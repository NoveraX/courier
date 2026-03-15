import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/shared/formatters";

const COLORS = {
  network: "bg-blue-500",
  overhead: "bg-amber-500",
  fetch: "bg-emerald-500",
  download: "bg-violet-500",
} as const;

interface WaterfallBarProps {
  clientToProxy: number;
  proxyToBackend: number;
  backendToProxy: number;
  proxyToClient: number;
  total: number;
}

export function WaterfallBar({
  clientToProxy,
  proxyToBackend,
  backendToProxy,
  proxyToClient,
  total,
}: WaterfallBarProps): React.ReactElement {
  const pct = (v: number) => `${Math.max(1, (v / total) * 100)}%`;

  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/30">
        <div className={cn(COLORS.network, "rounded-l-full")} style={{ width: pct(clientToProxy) }} title={`Network: ${formatDuration(clientToProxy)}`} />
        <div className={COLORS.overhead} style={{ width: pct(proxyToBackend) }} title={`Overhead: ${formatDuration(proxyToBackend)}`} />
        <div className={COLORS.fetch} style={{ width: pct(backendToProxy) }} title={`Fetch: ${formatDuration(backendToProxy)}`} />
        <div className={cn(COLORS.download, "rounded-r-full")} style={{ width: pct(proxyToClient) }} title={`Download: ${formatDuration(proxyToClient)}`} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Legend color={COLORS.network} label="Network" value={clientToProxy} />
        <Legend color={COLORS.overhead} label="Overhead" value={proxyToBackend} />
        <Legend color={COLORS.fetch} label="Fetch" value={backendToProxy} />
        <Legend color={COLORS.download} label="Download" value={proxyToClient} />
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("size-2 rounded-full", color)} />
      <span className="text-body-sm text-muted-foreground">{label}</span>
      <span className="mono-sm tabular-nums text-foreground">{formatDuration(value)}</span>
    </div>
  );
}
