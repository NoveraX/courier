import { motion } from "motion/react";
import { Activity, AlertTriangle, Clock, Database, GitBranch, Route } from "lucide-react";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { StaggerList, STAGGER_ITEM_VARIANTS } from "@/components/shared/stagger-list";
import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";
import type { MockServerInfo } from "@/store/mock-slice";

interface KPIStripProps {
  server: MockServerInfo;
}

export function KPIStrip({ server }: KPIStripProps): React.ReactElement {
  return (
    <StaggerList className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
      <KPICard icon={Route} label="Routes" value={server.routeCount} variant="brand" />
      <KPICard icon={Database} label="Records" value={server.recordCount} variant="violet" />
      <KPICard icon={Activity} label="Requests" value={server.requestsServed} variant="emerald" />
      <KPICard icon={GitBranch} label="Scenarios" value={server.availableScenarios.length} variant="amber" />
      <KPICard
        icon={AlertTriangle}
        label="Errors"
        value={server.errorCount}
        variant={server.errorCount > 0 ? "danger" : "default"}
      />
      <UptimeCard uptime={server.uptime} />
    </StaggerList>
  );
}

type CardVariant = "default" | "brand" | "violet" | "emerald" | "amber" | "danger";

const VARIANT_STYLES: Record<CardVariant, {
  card: string;
  icon: string;
  iconBg: string;
  value: string;
}> = {
  default: {
    card: "border-border-subtle bg-card",
    icon: "text-muted-foreground",
    iconBg: "bg-muted/50 ring-1 ring-border-subtle",
    value: "text-foreground",
  },
  brand: {
    card: "border-accent-brand/15 bg-accent-brand/[0.03]",
    icon: "text-accent-brand",
    iconBg: "bg-accent-brand/10 ring-1 ring-accent-brand/20",
    value: "text-foreground",
  },
  violet: {
    card: "border-violet-500/15 bg-violet-500/[0.03]",
    icon: "text-violet-400",
    iconBg: "bg-violet-500/10 ring-1 ring-violet-500/20",
    value: "text-foreground",
  },
  emerald: {
    card: "border-emerald-500/15 bg-emerald-500/[0.03]",
    icon: "text-emerald-400",
    iconBg: "bg-emerald-500/10 ring-1 ring-emerald-500/20",
    value: "text-foreground",
  },
  amber: {
    card: "border-amber-500/15 bg-amber-500/[0.03]",
    icon: "text-amber-400",
    iconBg: "bg-amber-500/10 ring-1 ring-amber-500/20",
    value: "text-foreground",
  },
  danger: {
    card: "border-rose-500/15 bg-rose-500/[0.03]",
    icon: "text-rose-400",
    iconBg: "bg-rose-500/10 ring-1 ring-rose-500/20",
    value: "text-rose-400",
  },
};

function KPICard({
  icon: Icon,
  label,
  value,
  variant = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  variant?: CardVariant;
}): React.ReactElement {
  const styles = VARIANT_STYLES[variant];

  return (
    <motion.div
      variants={STAGGER_ITEM_VARIANTS}
      className={cn("rounded-xl border p-4 transition-colors", styles.card)}
    >
      <div className="flex items-center gap-2">
        <div className={cn("flex size-7 items-center justify-center rounded-lg", styles.iconBg)}>
          <Icon className={cn("size-3.5", styles.icon)} />
        </div>
        <span className="text-caption text-muted-foreground/70">{label}</span>
      </div>
      <AnimatedCounter
        value={value}
        format={formatInt}
        className={cn("mt-2.5 block text-h1 tabular-nums", styles.value)}
      />
    </motion.div>
  );
}

function UptimeCard({ uptime }: { uptime: number }): React.ReactElement {
  const styles = VARIANT_STYLES.default;

  return (
    <motion.div
      variants={STAGGER_ITEM_VARIANTS}
      className={cn("rounded-xl border p-4 transition-colors", styles.card)}
    >
      <div className="flex items-center gap-2">
        <div className={cn("flex size-7 items-center justify-center rounded-lg", styles.iconBg)}>
          <Clock className={cn("size-3.5", styles.icon)} />
        </div>
        <span className="text-caption text-muted-foreground/70">Uptime</span>
      </div>
      <span className={cn("mt-2.5 block text-h1 tabular-nums", styles.value)}>
        {formatUptime(uptime)}
      </span>
    </motion.div>
  );
}

function formatInt(n: number): string {
  return n.toLocaleString();
}

function formatUptime(ms: number): string {
  if (ms < 1000) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
