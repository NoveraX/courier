/**
 * Top toolbar for the mock store `DataTable`.
 *
 * Owns the collection name, record count badge, add/delete actions and
 * the search input. Pure presentation — all state lives in the parent.
 */

import { Plus, Trash2 } from "lucide-react";
import { SearchInput } from "@/components/shared/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DataTableToolbarProps {
  name: string;
  count: number;
  totalColumns: number;
  someChecked: boolean;
  checkedCount: number;
  hasDelete: boolean;
  search: string;
  onSearch: (v: string) => void;
  onBulkDelete: () => void;
  onAdd?: () => void;
}

export function DataTableToolbar({
  name,
  count,
  totalColumns,
  someChecked,
  checkedCount,
  hasDelete,
  search,
  onSearch,
  onBulkDelete,
  onAdd,
}: DataTableToolbarProps): React.ReactElement {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <span className="text-body-sm font-medium">{name}</span>
      <Badge variant="secondary" className="text-[10px] tabular-nums">
        {count}
      </Badge>
      {onAdd && (
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onAdd}>
          <Plus className="size-3" />
          Add
        </Button>
      )}
      {someChecked && hasDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-rose-400 hover:text-rose-300"
          onClick={onBulkDelete}
        >
          <Trash2 className="size-3" />
          Delete {checkedCount}
        </Button>
      )}
      <div className="flex-1" />
      <span className="text-[10px] tabular-nums text-muted-foreground/40">
        {totalColumns} fields
      </span>
      <SearchInput value={search} onChange={onSearch} placeholder="Search records..." />
    </div>
  );
}
