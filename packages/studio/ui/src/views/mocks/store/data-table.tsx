import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/search-input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { MockCollectionEntry } from "@/store/mock-slice";
import type { FieldType, SortDir } from "./data-table-utils";

import { buildDefaultRecord, detectColumns, detectColumnTypes, recordKey, sortRecords } from "./data-table-utils";
import { EditableCell } from "./editable-cell";

const ROW_HEIGHT = 36;
const COL_WIDTH = 140;
const FROZEN_WIDTH = 52;

interface DataTableProps {
  collection: MockCollectionEntry;
  onDeleteRecords?: (ids: string[]) => void;
  onAddRecord?: (defaults: Record<string, unknown>) => void;
  onUpdateField?: (recordId: string, field: string, value: unknown) => void;
}

export function DataTable({
  collection, onDeleteRecords, onAddRecord, onUpdateField,
}: DataTableProps): React.ReactElement {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ key: string; col: string } | null>(null);
  const [pendingScrollBottom, setPendingScrollBottom] = useState(false);
  const prevRecordCount = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const records = collection.records as Record<string, unknown>[];
  const columns = useMemo(() => detectColumns(records), [records]);
  const colTypes = useMemo(() => detectColumnTypes(records, columns), [records, columns]);
  const hasCheckbox = Boolean(onDeleteRecords);
  const frozenW = hasCheckbox ? FROZEN_WIDTH + 40 : FROZEN_WIDTH;

  const filtered = useMemo(() => {
    let result = records;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }
    if (sortCol) result = sortRecords(result, sortCol, sortDir);
    return result;
  }, [records, search, sortCol, sortDir]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  // Scroll to bottom when a new record appears after Add
  useEffect(() => {
    if (pendingScrollBottom && filtered.length > prevRecordCount.current) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(filtered.length - 1, { align: "end" });
      });
      setPendingScrollBottom(false);
    }
    prevRecordCount.current = filtered.length;
  }, [filtered.length, pendingScrollBottom, virtualizer]);

  const handleAdd = () => {
    onAddRecord?.(buildDefaultRecord(colTypes));
    setPendingScrollBottom(true);
  };

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleAll = () => {
    if (checkedIds.size === filtered.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(filtered.map((r, i) => recordKey(r, i))));
  };

  const handleBulkDelete = () => {
    if (!onDeleteRecords || checkedIds.size === 0) return;
    onDeleteRecords(Array.from(checkedIds));
    setCheckedIds(new Set());
  };

  const handleCellCommit = (record: Record<string, unknown>, col: string, value: unknown) => {
    const id = record.id ?? record._id;
    if (id !== undefined && onUpdateField) {
      onUpdateField(String(id), col, value);
    }
    setEditingCell(null);
  };

  const allChecked = filtered.length > 0 && checkedIds.size === filtered.length;
  const someChecked = checkedIds.size > 0;
  const scrollWidth = frozenW + columns.length * COL_WIDTH;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <DataTableToolbar
        name={collection.name} count={filtered.length} totalColumns={columns.length}
        someChecked={someChecked} checkedCount={checkedIds.size} hasDelete={Boolean(onDeleteRecords)}
        search={search} onSearch={setSearch} onBulkDelete={handleBulkDelete} onAdd={onAddRecord ? handleAdd : undefined}
      />

      <div ref={scrollRef} className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex h-8 items-center border-b border-border-subtle bg-background" style={{ minWidth: scrollWidth }}>
          <FrozenCells hasCheckbox={hasCheckbox} frozenW={frozenW}>
            {hasCheckbox && (
              <div className="flex w-10 shrink-0 items-center justify-center">
                <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={toggleAll} className="size-3.5" />
              </div>
            )}
            <div className="w-12 shrink-0 text-center text-[11px] text-muted-foreground">#</div>
          </FrozenCells>
          {columns.map((col) => (
            <ColumnHeader key={col} col={col} type={colTypes[col] ?? "str"} active={sortCol === col} dir={sortDir} onSort={handleSort} />
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-body-sm text-muted-foreground/50">
            {search ? "No records match your search." : "No records in this collection."}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), minWidth: scrollWidth, position: "relative" }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const record = filtered[vi.index]!;
              const key = recordKey(record, vi.index);
              return (
                <div
                  key={key}
                  className="data-row absolute left-0 top-0 flex w-full items-center border-b border-border-subtle bg-background transition-colors hover:bg-muted/50"
                  style={{ height: vi.size, minWidth: scrollWidth, transform: `translateY(${vi.start}px)` }}
                >
                  <FrozenCells hasCheckbox={hasCheckbox} frozenW={frozenW}>
                    {hasCheckbox && (
                      <div className="flex w-10 shrink-0 items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={checkedIds.has(key)} onCheckedChange={() => toggleCheck(key)} className="size-3.5" />
                      </div>
                    )}
                    <div className="w-12 shrink-0 text-center mono-xs text-muted-foreground/50">{vi.index + 1}</div>
                  </FrozenCells>
                  {columns.map((col) => (
                    <EditableCell
                      key={col}
                      value={record[col]}
                      type={colTypes[col] ?? "str"}
                      isEditing={editingCell?.key === key && editingCell?.col === col}
                      onStartEdit={() => setEditingCell({ key, col })}
                      onCommit={(v) => handleCellCommit(record, col, v)}
                      onCancel={() => setEditingCell(null)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Frozen Cells ─────────────────────────────────────────────────────────────

function FrozenCells({ children, hasCheckbox, frozenW }: {
  children: React.ReactNode; hasCheckbox: boolean; frozenW: number;
}): React.ReactElement {
  return (
    <div
      className={cn("frozen-cell sticky left-0 z-10 flex shrink-0 items-center transition-colors", hasCheckbox && "border-r border-border-subtle/50")}
      style={{ width: frozenW }}
    >
      {children}
    </div>
  );
}

// ── Column Header with type ──────────────────────────────────────────────────

const TYPE_COLOR: Record<FieldType, string> = {
  str: "text-emerald-400/60",
  num: "text-sky-400/60",
  bool: "text-amber-400/60",
  obj: "text-violet-400/60",
  arr: "text-fuchsia-400/60",
  null: "text-zinc-400/60",
};

function ColumnHeader({ col, type, active, dir, onSort }: {
  col: string; type: FieldType; active: boolean; dir: SortDir; onSort: (col: string) => void;
}): React.ReactElement {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <div className="flex w-35 shrink-0 cursor-pointer select-none items-center truncate px-2" onClick={() => onSort(col)}>
      <span className={cn("inline-flex items-center gap-1 text-[11px]", active && "text-foreground")}>
        {col}
        <span className={cn("text-[9px] font-medium", TYPE_COLOR[type])}>{type}</span>
        <Icon className="size-3 shrink-0" />
      </span>
    </div>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

function DataTableToolbar({ name, count, totalColumns, someChecked, checkedCount, hasDelete, search, onSearch, onBulkDelete, onAdd }: {
  name: string; count: number; totalColumns: number; someChecked: boolean; checkedCount: number; hasDelete: boolean;
  search: string; onSearch: (v: string) => void; onBulkDelete: () => void; onAdd?: () => void;
}): React.ReactElement {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <span className="text-body-sm font-medium">{name}</span>
      <Badge variant="secondary" className="text-[10px] tabular-nums">{count}</Badge>
      {onAdd && (
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onAdd}>
          <Plus className="size-3" />
          Add
        </Button>
      )}
      {someChecked && hasDelete && (
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-rose-400 hover:text-rose-300" onClick={onBulkDelete}>
          <Trash2 className="size-3" />
          Delete {checkedCount}
        </Button>
      )}
      <div className="flex-1" />
      <span className="text-[10px] tabular-nums text-muted-foreground/40">{totalColumns} fields</span>
      <SearchInput value={search} onChange={onSearch} placeholder="Search records..." />
    </div>
  );
}
