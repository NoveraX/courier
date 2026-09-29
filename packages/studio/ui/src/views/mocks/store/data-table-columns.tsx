/**
 * Frozen left rail and sortable column header for the mock store `DataTable`.
 *
 * Both pieces are pure presentation; the parent owns the sort state and
 * feeds it in via props.
 */

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { buttonProps } from "@/lib/button-props";
import { cn } from "@/lib/utils";
import type { FieldType, SortDir } from "./data-table-utils";

const TYPE_COLOR: Record<FieldType, string> = {
  str: "text-emerald-400/60",
  num: "text-sky-400/60",
  bool: "text-amber-400/60",
  obj: "text-violet-400/60",
  arr: "text-fuchsia-400/60",
  null: "text-zinc-400/60",
};

interface FrozenCellsProps {
  children: React.ReactNode;
  hasCheckbox: boolean;
  frozenW: number;
}

export function FrozenCells({
  children,
  hasCheckbox,
  frozenW,
}: FrozenCellsProps): React.ReactElement {
  return (
    <div
      className={cn(
        "frozen-cell sticky left-0 z-10 flex shrink-0 items-center transition-colors",
        hasCheckbox && "border-r border-border-subtle/50",
      )}
      style={{ width: frozenW }}
    >
      {children}
    </div>
  );
}

interface ColumnHeaderProps {
  col: string;
  type: FieldType;
  active: boolean;
  dir: SortDir;
  onSort: (col: string) => void;
}

export function ColumnHeader({
  col,
  type,
  active,
  dir,
  onSort,
}: ColumnHeaderProps): React.ReactElement {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <div
      className="flex w-35 shrink-0 cursor-pointer select-none items-center truncate px-2"
      {...buttonProps(() => onSort(col))}
    >
      <span
        className={cn("inline-flex items-center gap-1 text-[11px]", active && "text-foreground")}
      >
        {col}
        <span className={cn("text-[9px] font-medium", TYPE_COLOR[type])}>{type}</span>
        <Icon className="size-3 shrink-0" />
      </span>
    </div>
  );
}
