/**
 * Header row and data row presentation pieces for the mock store `DataTable`.
 *
 * Both pieces are pure presentation: the parent owns checked/sort/edit
 * state and feeds them in via props.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { ColumnHeader, FrozenCells } from "./data-table-columns";
import type { FieldType, SortDir } from "./data-table-utils";
import { EditableCell } from "./editable-cell";

interface DataTableHeaderProps {
  hasCheckbox: boolean;
  frozenW: number;
  scrollWidth: number;
  allChecked: boolean;
  someChecked: boolean;
  onToggleAll: () => void;
  columns: string[];
  colTypes: Record<string, FieldType>;
  sortCol: string | null;
  sortDir: SortDir;
  onSort: (col: string) => void;
}

export function DataTableHeader({
  hasCheckbox,
  frozenW,
  scrollWidth,
  allChecked,
  someChecked,
  onToggleAll,
  columns,
  colTypes,
  sortCol,
  sortDir,
  onSort,
}: DataTableHeaderProps): React.ReactElement {
  return (
    <div
      className="sticky top-0 z-10 flex h-8 items-center border-b border-border-subtle bg-background"
      style={{ minWidth: scrollWidth }}
    >
      <FrozenCells hasCheckbox={hasCheckbox} frozenW={frozenW}>
        {hasCheckbox && (
          <div className="flex w-10 shrink-0 items-center justify-center">
            <Checkbox
              checked={allChecked ? true : someChecked ? "indeterminate" : false}
              onCheckedChange={onToggleAll}
              className="size-3.5"
            />
          </div>
        )}
        <div className="w-12 shrink-0 text-center text-[11px] text-muted-foreground">#</div>
      </FrozenCells>
      {columns.map((col) => (
        <ColumnHeader
          key={col}
          col={col}
          type={colTypes[col] ?? "str"}
          active={sortCol === col}
          dir={sortDir}
          onSort={onSort}
        />
      ))}
    </div>
  );
}

interface DataTableRowProps {
  record: Record<string, unknown>;
  rowKey: string;
  index: number;
  size: number;
  start: number;
  hasCheckbox: boolean;
  frozenW: number;
  scrollWidth: number;
  isChecked: boolean;
  onToggleCheck: (id: string) => void;
  columns: string[];
  colTypes: Record<string, FieldType>;
  editingCell: { key: string; col: string } | null;
  onStartEdit: (key: string, col: string) => void;
  onCommit: (record: Record<string, unknown>, col: string, value: unknown) => void;
  onCancelEdit: () => void;
}

export function DataTableRow({
  record,
  rowKey,
  index,
  size,
  start,
  hasCheckbox,
  frozenW,
  scrollWidth,
  isChecked,
  onToggleCheck,
  columns,
  colTypes,
  editingCell,
  onStartEdit,
  onCommit,
  onCancelEdit,
}: DataTableRowProps): React.ReactElement {
  return (
    <div
      className="data-row absolute left-0 top-0 flex w-full items-center border-b border-border-subtle bg-background transition-colors hover:bg-muted/50"
      style={{ height: size, minWidth: scrollWidth, transform: `translateY(${start}px)` }}
    >
      <FrozenCells hasCheckbox={hasCheckbox} frozenW={frozenW}>
        {hasCheckbox && (
          <div className="flex w-10 shrink-0 items-center justify-center">
            <Checkbox
              checked={isChecked}
              onCheckedChange={() => onToggleCheck(rowKey)}
              className="size-3.5"
            />
          </div>
        )}
        <div className="w-12 shrink-0 text-center mono-xs text-muted-foreground/50">
          {index + 1}
        </div>
      </FrozenCells>
      {columns.map((col) => (
        <EditableCell
          key={col}
          value={record[col]}
          type={colTypes[col] ?? "str"}
          isEditing={editingCell?.key === rowKey && editingCell?.col === col}
          onStartEdit={() => onStartEdit(rowKey, col)}
          onCommit={(v) => onCommit(record, col, v)}
          onCancel={onCancelEdit}
        />
      ))}
    </div>
  );
}
