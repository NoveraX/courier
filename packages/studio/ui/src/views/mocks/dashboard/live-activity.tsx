import { Link } from "@tanstack/react-router";
import { Activity, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { STAGGER_ITEM_VARIANTS } from "@/components/shared/stagger-list";
import { cn } from "@/lib/utils";
import { MethodBadge } from "@/components/shared/method-badge";
import { MetricsPill, statusDotClass } from "@/components/shared/metrics-cells";
import { formatTimestamp } from "@/components/shared/formatters";
import { useStudioStore } from "@/store";
import { useNow } from "@/hooks/use-tick";
import { useMockStore } from "@/store/mock-slice";

import type { MockRequestLog } from "@/store/mock-slice";

const RECENT_COUNT = 8;

export function LiveActivity(): React.ReactElement {
  const allLogs = useMockStore((s) => s.logs);
  const activeServerId = useMockStore((s) => s.activeServerId);
  const logs = activeServerId ? allLogs.filter((l) => l.serverId === activeServerId) : allLogs;
  const recent = logs.slice(0, RECENT_COUNT);
  const totalCount = logs.length;

  return (
    <div className="flex flex-col rounded-xl border border-border-subtle bg-card">
      <ActivityHeader recentCount={recent.length} totalCount={totalCount} />

      {recent.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <motion.div
            className="flex flex-col"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
          >
            {recent.map((log) => (
              <motion.div key={log.id} variants={STAGGER_ITEM_VARIANTS}>
                <ActivityRow log={log} />
              </motion.div>
            ))}
          </motion.div>
          {totalCount > RECENT_COUNT && <ViewAllFooter count={totalCount} />}
        </>
      )}
    </div>
  );
}

function ActivityHeader({
  recentCount,
  totalCount,
}: {
  recentCount: number;
  totalCount: number;
}): React.ReactElement {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2.5 border-b border-border-subtle px-4">
      <div className="relative flex items-center">
        <Activity className="size-3.5 text-accent-brand/70" />
        {recentCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-emerald-400 animate-pulse" />
        )}
      </div>
      <span className="text-caption text-muted-foreground/70">RECENT ACTIVITY</span>
      {totalCount > 0 && (
        <span className="rounded-full bg-muted/60 px-1.5 py-px text-caption tabular-nums text-muted-foreground/60">
          {totalCount}
        </span>
      )}
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10">
      <div className="flex size-9 items-center justify-center rounded-lg bg-muted/40">
        <Activity className="size-4 text-muted-foreground/30" />
      </div>
      <p className="text-body-xs text-muted-foreground/50">
        Waiting for requests…
      </p>
    </div>
  );
}

function ViewAllFooter({ count }: { count: number }): React.ReactElement {
  return (
    <Link
      to="/mocks/logs"
      className="flex h-9 items-center justify-center gap-1.5 border-t border-border-subtle text-body-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
    >
      View all {count} requests
      <ArrowRight className="size-3" />
    </Link>
  );
}

function ActivityRow({ log }: { log: MockRequestLog }): React.ReactElement {
  const timestampFormat = useStudioStore((s) => s.settings.timestampFormat);
  const now = useNow();
  const path = log.group ? `${log.group}.${log.endpoint}` : log.path;

  return (
    <div
      className={cn(
        "group flex min-h-8 items-center gap-3 px-4",
        "transition-colors duration-75",
        "hover:bg-muted/40 border-b border-border-subtle/50 last:border-b-0",
      )}
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
    </div>
  );
}
