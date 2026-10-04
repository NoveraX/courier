import { motion } from "motion/react";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { MethodBadge } from "@/components/shared/method-badge";
import { STAGGER_ITEM_VARIANTS } from "@/components/shared/stagger-list";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";

import type { MockRouteEntry } from "@/store/mock-slice";

interface RouteRowProps {
  route: MockRouteEntry;
  selected: boolean;
  onClick: () => void;
}

export function RouteRow({ route, selected, onClick }: RouteRowProps): React.ReactElement {
  return (
    <motion.tr
      variants={STAGGER_ITEM_VARIANTS}
      className={cn(
        "cursor-pointer border-b border-border-subtle transition-colors hover:bg-muted/50",
        selected && "bg-accent-brand/5",
      )}
      onClick={onClick}
    >
      <TableCell>
        <MethodBadge method={route.httpMethod} />
      </TableCell>
      <TableCell className="font-mono text-body-sm">{route.fullPath}</TableCell>
      <TableCell className="text-body-sm text-muted-foreground">{route.group}</TableCell>
      <TableCell className="text-body-sm">{route.endpoint}</TableCell>
      <TableCell>
        <Badge
          variant={
            route.source === "auto" ? "secondary" : route.source === "override" ? "amber" : "violet"
          }
        >
          {route.source}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums text-body-sm text-muted-foreground">
        {route.avgLatency > 0 ? formatDuration(route.avgLatency) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <AnimatedCounter value={route.hits} className="text-body-sm" />
      </TableCell>
    </motion.tr>
  );
}
