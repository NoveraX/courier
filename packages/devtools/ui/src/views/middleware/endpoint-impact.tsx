import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/shared/formatters";
import { MethodBadge } from "@/components/shared/method-badge";

import type { EndpointImpact } from "./types";

// ── Props ──────────────────────────────────────────────────────────────────

interface EndpointImpactProps {
  endpoints: EndpointImpact[];
  onSelect: (requestId: string) => void;
}

const MAX_SHOWN = 10;

// ── Component ──────────────────────────────────────────────────────────────

export function EndpointImpactPanel({
  endpoints,
  onSelect,
}: EndpointImpactProps): React.ReactElement | null {
  if (endpoints.length === 0) return null;

  const shown = endpoints.slice(0, MAX_SHOWN);
  const maxOverhead = Math.max(...shown.map((e) => e.overheadPercent), 0.01);

  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4">
      <h4 className="mb-3 text-caption text-muted-foreground/70">
        Endpoint Impact
      </h4>
      <div className="space-y-1.5">
        {shown.map((ep, i) => (
          <EndpointRow
            key={ep.key}
            endpoint={ep}
            maxOverhead={maxOverhead}
            index={i}
            onClick={() => onSelect(ep.sampleRequestId)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function EndpointRow({
  endpoint: ep,
  maxOverhead,
  index,
  onClick,
}: {
  endpoint: EndpointImpact;
  maxOverhead: number;
  index: number;
  onClick: () => void;
}): React.ReactElement {
  const barPct = maxOverhead > 0 ? (ep.overheadPercent / maxOverhead) * 100 : 0;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/30"
    >
      <MethodBadge method={ep.httpMethod} />
      <span className="min-w-0 flex-1 truncate mono-sm text-left text-foreground">
        {ep.source}.{ep.group ? `${ep.group}.` : ""}{ep.method}
      </span>

      {/* Overhead bar */}
      <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted/20">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(barPct, 3)}%` }}
          transition={{ delay: index * 0.03 + 0.1, duration: 0.4 }}
          className={cn(
            "h-full rounded-full",
            ep.overheadPercent > 20 ? "bg-rose-500" : ep.overheadPercent > 5 ? "bg-amber-500" : "bg-sky-500",
          )}
        />
      </div>

      <span className="w-12 shrink-0 text-right mono-xs tabular-nums text-muted-foreground">
        {ep.overheadPercent.toFixed(1)}%
      </span>
      <span className="w-14 shrink-0 text-right mono-xs tabular-nums text-muted-foreground">
        {formatDuration(ep.avgMiddlewareTime)}
      </span>
      <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/50">
        {ep.middlewareCount} mw
      </span>
    </motion.button>
  );
}
