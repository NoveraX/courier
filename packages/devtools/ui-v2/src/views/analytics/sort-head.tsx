import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";

import type { EndpointSortKey, SortDir } from "./types";

interface SortHeadProps {
  label: string;
  sortKey: EndpointSortKey;
  current: EndpointSortKey;
  dir: SortDir;
  onSort: (key: EndpointSortKey) => void;
  align?: "left" | "right";
}

export function SortHead({ label, sortKey, current, dir, onSort, align = "right" }: SortHeadProps): React.ReactElement {
  const active = sortKey === current;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead className={cn("cursor-pointer select-none whitespace-nowrap", align === "right" && "text-right")} onClick={() => onSort(sortKey)}>
      <span className={cn("inline-flex items-center gap-1 text-[11px]", active && "text-foreground")}>
        {label}
        <Icon className="size-3 shrink-0" />
      </span>
    </TableHead>
  );
}
