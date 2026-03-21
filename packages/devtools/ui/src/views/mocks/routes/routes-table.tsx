import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MethodBadge } from "@/components/shared/method-badge";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { STAGGER_ITEM_VARIANTS } from "@/components/shared/stagger-list";
import { cn } from "@/lib/utils";

import type { MockRouteEntry } from "@/store/mock-slice";
import type { RouteSortKey, SortDir } from "./use-routes-filter";

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
            <SortCol label="Hits" sortKey="hits" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {routes.map((route) => (
            <RouteRow
              key={`${route.httpMethod}-${route.fullPath}`}
              route={route}
              selected={selectedRoute?.fullPath === route.fullPath && selectedRoute?.httpMethod === route.httpMethod}
              onClick={() => onSelect(route)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RouteRow({
  route,
  selected,
  onClick,
}: {
  route: MockRouteEntry;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <motion.tr
      variants={STAGGER_ITEM_VARIANTS}
      className={cn(
        "cursor-pointer border-border-subtle transition-colors hover:bg-muted/50",
        selected && "bg-accent-brand/5",
      )}
      onClick={onClick}
    >
      <TableCell><MethodBadge method={route.httpMethod} /></TableCell>
      <TableCell className="font-mono text-body-sm">{route.fullPath}</TableCell>
      <TableCell className="text-body-sm text-muted-foreground">{route.group}</TableCell>
      <TableCell className="text-body-sm">{route.endpoint}</TableCell>
      <TableCell>
        <Badge variant={route.source === "auto" ? "secondary" : route.source === "override" ? "amber" : "violet"}>
          {route.source}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <AnimatedCounter value={route.hits} className="text-body-sm" />
      </TableCell>
    </motion.tr>
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
    >
      <span className={cn("inline-flex items-center gap-1 text-[11px]", active && "text-foreground")}>
        {label}
        <Icon className="size-3 shrink-0" />
      </span>
    </TableHead>
  );
}
