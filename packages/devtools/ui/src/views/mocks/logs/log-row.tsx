import { cn } from "@/lib/utils";
import { MethodBadge } from "@/components/shared/method-badge";
import { formatTimestamp } from "@/components/shared/formatters";
import { MetricsPill, statusDotClass } from "@/components/shared/metrics-cells";
import { useDevToolsStore } from "@/store";
import { useNow } from "@/hooks/use-tick";

import type { MockRequestLog } from "@/store/mock-slice";

interface LogRowProps {
  log: MockRequestLog;
  selected: boolean;
  onSelect: (log: MockRequestLog) => void;
}

export function LogRow({ log, selected, onSelect }: LogRowProps): React.ReactElement {
  const timestampFormat = useDevToolsStore((s) => s.settings.timestampFormat);
  const now = useNow();
  const path = log.group ? `${log.group}.${log.endpoint}` : log.path;

  return (
    <button
      type="button"
      className={cn(
        "group flex w-full items-center gap-3 px-3 text-left",
        "h-[var(--density-row-h)] transition-colors duration-75",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected && "bg-accent-brand/8 hover:bg-accent-brand/12",
      )}
      onClick={() => onSelect(log)}
      data-log-id={log.id}
    >
      <span className={cn("size-2 shrink-0 rounded-full", statusDotClass(log.status, log.error))} />

      <span className="inline-flex w-17 shrink-0 items-center">
        <MethodBadge method={log.httpMethod} />
      </span>

      <span className="min-w-0 flex-1 truncate mono-sm text-foreground">
        {path}
      </span>

      <MetricsPill statusCode={log.status} duration={log.duration} />

      <span className="inline-flex w-24 shrink-0 items-center justify-end mono-sm tabular-nums text-muted-foreground">
        {formatTimestamp(log.timestamp, timestampFormat, now)}
      </span>
    </button>
  );
}
