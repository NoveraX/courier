import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/shared/formatters";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

import type { AggregateMiddleware } from "./types";
import { durationColor, durationBg } from "./constants";

// ── Props ──────────────────────────────────────────────────────────────────

interface MiddlewareTableProps {
  stats: AggregateMiddleware[];
  onRowClick: (name: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function MiddlewareTable({
  stats,
  onRowClick,
}: MiddlewareTableProps): React.ReactElement {
  const maxAvg = Math.max(...stats.map((s) => s.avgDuration), 0.001);

  return (
    <div className="rounded-xl border border-border-subtle bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-[11px]">Name</TableHead>
            <TableHead className="text-right text-[11px]">Calls</TableHead>
            <TableHead className="text-right text-[11px]">Avg</TableHead>
            <TableHead className="text-right text-[11px]">P95</TableHead>
            <TableHead className="text-right text-[11px]">Max</TableHead>
            <TableHead className="text-right text-[11px]">Errors</TableHead>
            <TableHead className="text-right text-[11px]">Error %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stats.map((mw) => (
            <TableRow
              key={mw.name}
              className="cursor-pointer transition-colors hover:bg-muted/30"
              onClick={() => onRowClick(mw.name)}
            >
              <TableCell className="mono-sm font-medium text-foreground">{mw.name}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{mw.calls}</TableCell>
              <TableCell className="text-right">
                <DurationCell value={mw.avgDuration} max={maxAvg} />
              </TableCell>
              <TableCell className={cn("text-right tabular-nums mono-sm", durationColor(mw.p95Duration))}>
                {formatDuration(mw.p95Duration)}
              </TableCell>
              <TableCell className={cn("text-right tabular-nums mono-sm", durationColor(mw.maxDuration))}>
                {formatDuration(mw.maxDuration)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {mw.errors > 0 ? <span className="text-rose-400">{mw.errors}</span> : "0"}
              </TableCell>
              <TableCell className="text-right mono-xs tabular-nums text-muted-foreground">
                {mw.errorRate.toFixed(1)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Duration cell with inline bar ──────────────────────────────────────────

function DurationCell({ value, max }: { value: number; max: number }): React.ReactElement {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1 w-14 overflow-hidden rounded-full bg-muted/20">
        <div
          className={cn("h-full rounded-full transition-all duration-500", durationBg(value))}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className={cn("mono-sm tabular-nums w-14 text-right", durationColor(value))}>
        {formatDuration(value)}
      </span>
    </div>
  );
}
