import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { STAGGER_ITEM_VARIANTS } from "@/components/shared/stagger-list";
import { formatDuration, formatSize } from "@/components/shared/formatters";
import { useRequestDetail } from "@/hooks/use-request-detail";
import type { RequestEntry } from "@/store/types";

import type { EndpointStat, EndpointSortKey, SortDir } from "./types";
import { sortEndpoints } from "./compute-endpoints";
import { MAX_ENDPOINTS_SHOWN, durationColor, errorRateColor } from "./constants";
import { EndpointCalls } from "./endpoint-calls";
import { SortHead } from "./sort-head";

interface EndpointsTableProps {
  data: EndpointStat[];
  requests: RequestEntry[];
}

export function EndpointsTable({ data, requests }: EndpointsTableProps): React.ReactElement {
  const [sortKey, setSortKey] = useState<EndpointSortKey>("p95");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { selectRequest } = useRequestDetail();

  const sorted = useMemo(() => sortEndpoints(data, sortKey, sortDir), [data, sortKey, sortDir]);
  const visible = showAll ? sorted : sorted.slice(0, MAX_ENDPOINTS_SHOWN);
  const requestsMap = useMemo(() => new Map(requests.map((r) => [r.id, r])), [requests]);

  function handleSort(key: EndpointSortKey): void {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function handleRowClick(stat: EndpointStat): void {
    if (stat.calls === 1) {
      selectRequest(stat.requestIds[0]!);
    } else {
      setExpanded((prev) => (prev === stat.endpoint ? null : stat.endpoint));
    }
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border-subtle hover:bg-transparent">
              <SortHead label="Endpoint" sortKey="endpoint" current={sortKey} dir={sortDir} onSort={handleSort} align="left" />
              <SortHead label="Calls" sortKey="calls" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHead label="Avg" sortKey="avgResponseTime" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHead label="P50" sortKey="p50" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHead label="P95" sortKey="p95" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHead label="P99" sortKey="p99" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHead label="Size" sortKey="avgSize" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHead label="Errors" sortKey="errorRate" current={sortKey} dir={sortDir} onSort={handleSort} />
            </TableRow>
          </TableHeader>
          <motion.tbody
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
            className="[&_tr:last-child]:border-0"
          >
            {visible.map((ep) => (
              <EndpointGroup
                key={ep.endpoint}
                stat={ep}
                isExpanded={expanded === ep.endpoint}
                requestsMap={requestsMap}
                onClick={() => handleRowClick(ep)}
              />
            ))}
          </motion.tbody>
        </Table>
      </div>

      {data.length > MAX_ENDPOINTS_SHOWN && (
        <div className="mt-2 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Show less" : `Show all ${data.length} endpoints`}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Endpoint Group (row + expandable calls) ─────────────────────────────────

function EndpointGroup({ stat, isExpanded, requestsMap, onClick }: {
  stat: EndpointStat;
  isExpanded: boolean;
  requestsMap: Map<string, RequestEntry>;
  onClick: () => void;
}): React.ReactElement {
  const expandable = stat.calls > 1;

  return (
    <>
      <motion.tr variants={STAGGER_ITEM_VARIANTS} className="cursor-pointer border-b border-border-subtle hover:bg-muted/40" onClick={onClick}>
        <TableCell className="mono-sm text-foreground">
          <span className="flex items-center gap-1.5">
            {expandable && (
              <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
            )}
            {stat.endpoint}
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{stat.calls}</TableCell>
        <TableCell className={cn("text-right mono-sm tabular-nums", durationColor(stat.avgResponseTime))}>
          {formatDuration(stat.avgResponseTime)}
        </TableCell>
        <TableCell className="text-right mono-sm tabular-nums text-muted-foreground">{formatDuration(stat.p50)}</TableCell>
        <TableCell className={cn("text-right mono-sm tabular-nums", durationColor(stat.p95))}>
          {formatDuration(stat.p95)}
        </TableCell>
        <TableCell className="text-right mono-sm tabular-nums text-muted-foreground">
          {formatDuration(stat.p99)}
        </TableCell>
        <TableCell className="text-right mono-sm tabular-nums text-muted-foreground">{formatSize(stat.avgSize)}</TableCell>
        <TableCell className={cn("text-right tabular-nums", errorRateColor(stat.errorRate))}>
          {stat.errorRate.toFixed(1)}%
        </TableCell>
      </motion.tr>
      {isExpanded && (
        <EndpointCalls requestIds={stat.requestIds} requestsMap={requestsMap} />
      )}
    </>
  );
}
