import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchInput } from "@/components/shared/search-input";
import { Badge } from "@/components/ui/badge";
import type { MockCollectionEntry } from "@/store/mock-slice";

interface DataTableProps {
  collection: MockCollectionEntry;
  onSelectRecord: (record: Record<string, unknown>) => void;
}

export function DataTable({ collection, onSelectRecord }: DataTableProps): React.ReactElement {
  const [search, setSearch] = useState("");
  const records = collection.records as Record<string, unknown>[];
  const columns = useMemo(() => detectColumns(records), [records]);

  const filtered = useMemo(() => {
    if (!search) return records;
    const q = search.toLowerCase();
    return records.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [records, search]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-1.5">
        <span className="text-body-sm font-medium">{collection.name}</span>
        <Badge variant="secondary" className="text-[10px] tabular-nums">{filtered.length}</Badge>
        <div className="flex-1" />
        <SearchInput value={search} onChange={setSearch} placeholder="Search records..." />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border-subtle hover:bg-transparent">
              <TableHead className="w-10 text-center">#</TableHead>
              {columns.map((col) => (
                <TableHead key={col} className="whitespace-nowrap text-[11px]">{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((record, idx) => (
              <TableRow
                key={recordKey(record, idx)}
                className="cursor-pointer border-border-subtle hover:bg-muted/50"
                onClick={() => onSelectRecord(record)}
              >
                <TableCell className="text-center text-mono-xs text-muted-foreground/50">{idx + 1}</TableCell>
                {columns.map((col) => (
                  <TableCell key={col} className="max-w-48 truncate text-body-sm">
                    {formatValue(record[col])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function detectColumns(records: Record<string, unknown>[]): string[] {
  if (records.length === 0) return [];
  const keys = new Set<string>();
  for (const r of records.slice(0, 5)) {
    for (const k of Object.keys(r)) keys.add(k);
  }
  return Array.from(keys);
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function recordKey(record: Record<string, unknown>, idx: number): string {
  const id = record.id ?? record._id;
  return id !== undefined ? String(id) : `row-${idx}`;
}
