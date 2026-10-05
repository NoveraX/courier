/**
 * State + handler hook for the mock store `DataTable`.
 *
 * Owns search/sort/selection/edit/scroll state and exposes memoised
 * derived values (filtered records, column metadata) plus the action
 * callbacks the host wires into the toolbar and rows.
 */

import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FieldType, SortDir } from "@/features/mocks/data-table-utils";
import {
  buildDefaultRecord,
  detectColumns,
  detectColumnTypes,
  recordKey,
  sortRecords,
} from "@/features/mocks/data-table-utils";
import type { MockCollectionEntry } from "@/store/mock-slice";

const ROW_HEIGHT = 36;

export interface DataTableStateOptions {
  collection: MockCollectionEntry;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onAddRecord?: ((defaults: Record<string, unknown>) => void) | undefined;
  onDeleteRecords?: ((ids: string[]) => void) | undefined;
  onUpdateField?: ((recordId: string, field: string, value: unknown) => void) | undefined;
}

export interface DataTableState {
  search: string;
  setSearch: (v: string) => void;
  sortCol: string | null;
  sortDir: SortDir;
  columns: string[];
  colTypes: Record<string, FieldType>;
  filtered: Record<string, unknown>[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  checkedIds: Set<string>;
  editingCell: { key: string; col: string } | null;
  setEditingCell: (cell: { key: string; col: string } | null) => void;
  handleAdd: () => void;
  handleSort: (col: string) => void;
  toggleCheck: (id: string) => void;
  toggleAll: () => void;
  handleBulkDelete: () => void;
  handleCellCommit: (record: Record<string, unknown>, col: string, value: unknown) => void;
}

export function useDataTableState({
  collection,
  scrollRef,
  onAddRecord,
  onDeleteRecords,
  onUpdateField,
}: DataTableStateOptions): DataTableState {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ key: string; col: string } | null>(null);
  const [pendingScrollBottom, setPendingScrollBottom] = useState(false);
  const prevRecordCount = useRef(0);

  const records = collection.records as Record<string, unknown>[];
  const columns = useMemo(() => detectColumns(records), [records]);
  const colTypes = useMemo(() => detectColumnTypes(records, columns), [records, columns]);

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
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  return {
    search,
    setSearch,
    sortCol,
    sortDir,
    columns,
    colTypes,
    filtered,
    virtualizer,
    checkedIds,
    editingCell,
    setEditingCell,
    handleAdd,
    handleSort,
    toggleCheck,
    toggleAll,
    handleBulkDelete,
    handleCellCommit,
  };
}
