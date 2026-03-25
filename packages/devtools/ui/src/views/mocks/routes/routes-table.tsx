import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { motion } from "motion/react";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { MockRouteEntry } from "@/store/mock-slice";
import type { RouteSortKey, SortDir } from "./use-routes-filter";
import { RouteRow } from "./route-row";

interface RoutesTableProps {
  routes: MockRouteEntry[];
  sortKey: RouteSortKey;
  sortDir: SortDir;
  onSort: (key: RouteSortKey) => void;
  onSelect: (route: MockRouteEntry) => void;
  selectedRoute: MockRouteEntry | null;
}

export function RoutesTable({
  routes,
  sortKey,
  sortDir,
  onSort,
  onSelect,
  selectedRoute,
}: RoutesTableProps): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border-subtle hover:bg-transparent">
            <TableHead className="w-20">Method</TableHead>
            <SortCol label="Path" sortKey="fullPath" current={sortKey} dir={sortDir} onSort={onSort} align="left" />
            <SortCol label="Group" sortKey="group" current={sortKey} dir={sortDir} onSort={onSort} align="left" />
            <TableHead className="text-left">Endpoint</TableHead>
            <SortCol label="Source" sortKey="source" current={sortKey} dir={sortDir} onSort={onSort} align="left" />
            <SortCol label="Avg Latency" sortKey="avgLatency" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortCol label="Hits" sortKey="hits" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
          </TableRow>
        </TableHeader>
        <motion.tbody
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
          className="[&_tr:last-child]:border-0"
        >
          {routes.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-12 text-center text-body-sm text-muted-foreground/50">
                No routes match your filters.
              </td>
            </tr>
          ) : (
            routes.map((route) => (
              <RouteRow
                key={`${route.httpMethod}-${route.group}-${route.endpoint}`}
                route={route}
                selected={
                  selectedRoute?.fullPath === route.fullPath &&
                  selectedRoute?.httpMethod === route.httpMethod &&
                  selectedRoute?.group === route.group &&
                  selectedRoute?.endpoint === route.endpoint
                }
                onClick={() => onSelect(route)}
              />
            ))
          )}
        </motion.tbody>
      </Table>
    </div>
  );
}

function SortCol({
  label,
  sortKey,
  current,
  dir,
  onSort,
  align = "right",
}: {
  label: string;
  sortKey: RouteSortKey;
  current: RouteSortKey;
  dir: SortDir;
  onSort: (key: RouteSortKey) => void;
  align?: "left" | "right";
}): React.ReactElement {
  const active = sortKey === current;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead
      className={cn("cursor-pointer select-none whitespace-nowrap", align === "right" && "text-right")}
      onClick={() => onSort(sortKey)}
      role="columnheader"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className={cn("inline-flex items-center gap-1 text-[11px]", active && "text-foreground")}>
        {label}
        <Icon className="size-3 shrink-0" />
      </span>
    </TableHead>
  );
}
