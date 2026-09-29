/**
 * Virtualized data table for the mock store view.
 *
 * Thin host that wires the `useDataTableState` hook into the toolbar,
 * header and row sub-components. The state hook lives in
 * `use-data-table-state.ts` and the presentation pieces live in
 * `data-table-toolbar.tsx`, `data-table-columns.tsx` and
 * `data-table-row.tsx`.
 */

import { useRef } from "react";

import type { MockCollectionEntry } from "@/store/mock-slice";

import { DataTableHeader, DataTableRow } from "./data-table-row";
import { DataTableToolbar } from "./data-table-toolbar";
import { recordKey } from "./data-table-utils";
import { useDataTableState } from "./use-data-table-state";

const COL_WIDTH = 140;
const FROZEN_WIDTH = 52;

interface DataTableProps {
  collection: MockCollectionEntry;
  onDeleteRecords?: (ids: string[]) => void;
  onAddRecord?: (defaults: Record<string, unknown>) => void;
  onUpdateField?: (recordId: string, field: string, value: unknown) => void;
}

export function DataTable({
  collection,
  onDeleteRecords,
  onAddRecord,
  onUpdateField,
}: DataTableProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const state = useDataTableState({
    collection,
    scrollRef,
    onAddRecord,
    onDeleteRecords,
    onUpdateField,
  });

  const hasCheckbox = Boolean(onDeleteRecords);
  const frozenW = hasCheckbox ? FROZEN_WIDTH + 40 : FROZEN_WIDTH;
  const scrollWidth = frozenW + state.columns.length * COL_WIDTH;
  const allChecked = state.filtered.length > 0 && state.checkedIds.size === state.filtered.length;
  const someChecked = state.checkedIds.size > 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <DataTableToolbar
        name={collection.name}
        count={state.filtered.length}
        totalColumns={state.columns.length}
        someChecked={someChecked}
        checkedCount={state.checkedIds.size}
        hasDelete={Boolean(onDeleteRecords)}
        search={state.search}
        onSearch={state.setSearch}
        onBulkDelete={state.handleBulkDelete}
        onAdd={onAddRecord ? state.handleAdd : undefined}
      />

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <DataTableHeader
          hasCheckbox={hasCheckbox}
          frozenW={frozenW}
          scrollWidth={scrollWidth}
          allChecked={allChecked}
          someChecked={someChecked}
          onToggleAll={state.toggleAll}
          columns={state.columns}
          colTypes={state.colTypes}
          sortCol={state.sortCol}
          sortDir={state.sortDir}
          onSort={state.handleSort}
        />

        {state.filtered.length === 0 ? (
          <div className="py-12 text-center text-body-sm text-muted-foreground/50">
            {state.search ? "No records match your search." : "No records in this collection."}
          </div>
        ) : (
          <div
            style={{
              height: state.virtualizer.getTotalSize(),
              minWidth: scrollWidth,
              position: "relative",
            }}
          >
            {state.virtualizer.getVirtualItems().map((vi) => {
              const record = state.filtered[vi.index]!;
              const key = recordKey(record, vi.index);
              return (
                <DataTableRow
                  key={key}
                  record={record}
                  rowKey={key}
                  index={vi.index}
                  size={vi.size}
                  start={vi.start}
                  hasCheckbox={hasCheckbox}
                  frozenW={frozenW}
                  scrollWidth={scrollWidth}
                  isChecked={state.checkedIds.has(key)}
                  onToggleCheck={state.toggleCheck}
                  columns={state.columns}
                  colTypes={state.colTypes}
                  editingCell={state.editingCell}
                  onStartEdit={(k, c) => state.setEditingCell({ key: k, col: c })}
                  onCommit={state.handleCellCommit}
                  onCancelEdit={() => state.setEditingCell(null)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
