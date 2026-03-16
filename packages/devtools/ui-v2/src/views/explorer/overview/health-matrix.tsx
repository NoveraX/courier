import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDuration, formatNumber } from "@/components/shared/formatters";
import { HealthIndicator } from "../shared/health-indicator";

import type { HealthMatrixCell } from "./compute-overview";

// ── Component ───────────────────────────────────────────────────────────────

interface HealthMatrixProps {
  cells: HealthMatrixCell[];
}

export function HealthMatrix({ cells }: HealthMatrixProps): React.ReactElement {
  const bySource = groupBySource(cells);

  if (cells.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-body-xs text-muted-foreground/60">
        No groups to display
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bySource.map(({ source, groups }) => (
        <div key={source}>
          <div className="mb-1.5 text-body-xs font-medium text-foreground/80">
            {source}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((cell) => (
              <GroupChip key={`${cell.source}.${cell.group}`} cell={cell} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Group chip with tooltip ─────────────────────────────────────────────────

function GroupChip({ cell }: { cell: HealthMatrixCell }): React.ReactElement {
  const { metrics, level } = cell;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md border border-border-subtle/50 bg-muted/20 px-2 py-1 text-body-xs transition-colors hover:bg-muted/40">
          <HealthIndicator level={level} pulse={metrics.isActive} size="sm" />
          <span className="text-muted-foreground">{cell.group}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-body-xs">
        <div className="space-y-0.5">
          <div className="font-medium text-background">
            {cell.source}.{cell.group}
          </div>
          <div className="text-background/60">
            {formatNumber(metrics.totalRequests)} calls ·{" "}
            {metrics.successRate.toFixed(1)}% success ·{" "}
            {formatDuration(metrics.avgResponseTime)} avg
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface SourceGroup {
  source: string;
  groups: HealthMatrixCell[];
}

function groupBySource(cells: HealthMatrixCell[]): SourceGroup[] {
  const map = new Map<string, HealthMatrixCell[]>();

  for (const cell of cells) {
    const existing = map.get(cell.source);
    if (existing) {
      existing.push(cell);
    } else {
      map.set(cell.source, [cell]);
    }
  }

  return [...map.entries()].map(([source, groups]) => ({ source, groups }));
}
