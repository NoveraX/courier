import type { Header, SortingState } from "@tanstack/react-table";
import {
  columnSizingFeature,
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { motion } from "motion/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { EndpointNodeData } from "../types";
import { EndpointRow } from "./endpoint-row";

// ── Props ──────────────────────────────────────────────────────────────────

interface EndpointsTableProps {
  data: EndpointNodeData[];
  sorting: SortingState;
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

// ── Table features ─────────────────────────────────────────────────────────

const features = tableFeatures({
  columnSizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
});

// ── Column definitions ─────────────────────────────────────────────────────

const col = createColumnHelper<typeof features, EndpointNodeData>();

const columns = col.columns([
  col.display({ id: "health", header: "", size: 40 }),
  col.accessor("method", { header: "Endpoint", size: 180 }),
  col.accessor("fullPath", { header: "Path", size: 200 }),
  col.accessor("endpointType", { header: "Type", size: 90 }),
  col.accessor("httpMethod", { header: "HTTP", size: 80 }),
  col.accessor((r) => r.metrics.totalRequests, { id: "calls", header: "Calls", size: 70 }),
  col.accessor((r) => r.metrics.avgResponseTime, { id: "avg", header: "Avg", size: 70 }),
  col.accessor((r) => r.metrics.p95ResponseTime, { id: "p95", header: "P95", size: 70 }),
  col.accessor((r) => r.metrics.successRate, { id: "health_pct", header: "Health", size: 70 }),
  col.accessor((r) => r.metrics.avgSize, { id: "size", header: "Size", size: 70 }),
]);

type EndpointHeader = Header<typeof features, EndpointNodeData, unknown>;

// ── Component ──────────────────────────────────────────────────────────────

export function EndpointsTable({
  data,
  sorting,
  onSortingChange,
  selectedKey,
  onSelect,
}: EndpointsTableProps): React.ReactElement {
  const table = useTable({
    features,
    data,
    columns,
    state: { sorting },
    onSortingChange,
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <table className="w-full caption-bottom text-sm">
        <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          {headerGroups.map((hg) => (
            <tr key={hg.id} className="border-b border-border-subtle">
              {hg.headers.map((header) => (
                <SortableHeader key={header.id} header={header} />
              ))}
            </tr>
          ))}
        </thead>
        <motion.tbody
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
        >
          {rows.map((row) => (
            <EndpointRow
              key={row.id}
              endpoint={row.original}
              isSelected={isRowSelected(row.original, selectedKey)}
              onSelect={onSelect}
            />
          ))}
        </motion.tbody>
      </table>
    </ScrollArea>
  );
}

// ── Sortable header cell ───────────────────────────────────────────────────

function SortableHeader({ header }: { header: EndpointHeader }): React.ReactElement {
  const canSort = header.column.getCanSort();
  const sorted = header.column.getIsSorted();

  const isNumeric = ["calls", "avg", "p95", "health_pct", "size"].includes(header.column.id);
  const isCentered = ["endpointType", "httpMethod"].includes(header.column.id);

  return (
    <th
      className={cn(
        "h-8 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60",
        isNumeric && "text-right",
        isCentered && "text-center",
        canSort && "cursor-pointer select-none hover:text-muted-foreground",
      )}
      style={{ width: header.getSize() }}
      onClick={header.column.getToggleSortingHandler()}
    >
      <span className="inline-flex items-center gap-1">
        {flexRender(header.column.columnDef.header, header.getContext())}
        {canSort && <SortIcon sorted={sorted} />}
      </span>
    </th>
  );
}

// ── Sort icon ──────────────────────────────────────────────────────────────

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }): React.ReactElement {
  if (sorted === "asc") return <ArrowUp className="size-3" />;
  if (sorted === "desc") return <ArrowDown className="size-3" />;
  return <ArrowUpDown className="size-3 opacity-30" />;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isRowSelected(ep: EndpointNodeData, key: string | null): boolean {
  if (!key) return false;
  return `${ep.source}.${ep.group}.${ep.method}` === key;
}
