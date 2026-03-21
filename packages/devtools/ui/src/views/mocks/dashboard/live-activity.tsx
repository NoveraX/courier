import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMockStore, type MockRequestLog } from "@/store/mock-slice";

const METHOD_VARIANT: Record<string, string> = {
  GET: "emerald",
  POST: "sky",
  PUT: "amber",
  PATCH: "violet",
  DELETE: "rose",
};

export function LiveActivity(): React.ReactElement {
  const logs = useMockStore((s) => s.logs);
  const recent = logs.slice(0, 20);

  if (recent.length === 0) {
    return (
      <div className="flex flex-col rounded-xl border border-border-subtle bg-card p-4">
        <SectionHeader />
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <Activity className="size-5 text-muted-foreground/30 mb-2" />
          <p className="text-body-xs text-muted-foreground/50">
            No requests yet. Send a request to your mock server to see activity here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4">
      <SectionHeader count={recent.length} />
      <div className="mt-3 space-y-0.5 max-h-72 overflow-y-auto pr-1">
        {recent.map((log) => (
          <ActivityRow key={log.id} log={log} />
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ count }: { count?: number }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <Activity className="size-3.5 text-muted-foreground/50" />
      <span className="text-caption text-muted-foreground/70">LIVE ACTIVITY</span>
      {count !== undefined && count > 0 && (
        <span className="text-caption text-muted-foreground/40">{count}</span>
      )}
    </div>
  );
}

function ActivityRow({ log }: { log: MockRequestLog }): React.ReactElement {
  const time = new Date(log.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1 text-body-xs transition-colors hover:bg-muted/20">
      {/* Status dot */}
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          log.error ? "bg-rose-400" : log.status && log.status >= 400 ? "bg-amber-400" : "bg-emerald-400",
          !log.status && "bg-zinc-400 animate-pulse",
        )}
      />

      {/* Time */}
      <span className="w-16 shrink-0 tabular-nums text-mono-xs text-muted-foreground/60">
        {time}
      </span>

      {/* Method */}
      <Badge
        variant={(METHOD_VARIANT[log.httpMethod] ?? "secondary") as "emerald"}
        className="text-[9px] px-1.5 py-0"
      >
        {log.httpMethod}
      </Badge>

      {/* Endpoint */}
      <span className="flex-1 truncate font-medium text-foreground/80">
        {log.group}.{log.endpoint}
      </span>

      {/* Duration */}
      {log.duration !== undefined && (
        <span className={cn(
          "shrink-0 tabular-nums text-mono-xs",
          durationColor(log.duration),
        )}>
          {log.duration}ms
        </span>
      )}

      {/* Status */}
      {log.status && (
        <span className={cn(
          "shrink-0 tabular-nums text-mono-xs",
          log.status >= 500 ? "text-rose-400/80" : log.status >= 400 ? "text-amber-400/80" : "text-muted-foreground/50",
        )}>
          {log.status}
        </span>
      )}
    </div>
  );
}

function durationColor(ms: number): string {
  if (ms < 50) return "text-emerald-400/80";
  if (ms < 200) return "text-amber-400/80";
  return "text-rose-400/80";
}
