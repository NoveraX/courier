import type { EndpointSort } from "@/features/analytics/analytics-search";

/** A column of the endpoints table: what it sorts by, its head, and whether only a wide table shows it. */
export interface EndpointColumn {
  sort: EndpointSort;
  label: string;
  /** Shown only once the table is wide enough for all eight columns. */
  wideOnly: boolean;
}

/** The endpoints table's columns, left to right. */
export const ENDPOINT_COLUMNS: readonly EndpointColumn[] = [
  { sort: "endpoint", label: "Endpoint", wideOnly: false },
  { sort: "calls", label: "Calls", wideOnly: false },
  { sort: "avg", label: "Avg", wideOnly: false },
  { sort: "p50", label: "P50", wideOnly: true },
  { sort: "p95", label: "P95", wideOnly: false },
  { sort: "p99", label: "P99", wideOnly: true },
  { sort: "size", label: "Size", wideOnly: true },
  { sort: "errorRate", label: "Errors", wideOnly: false },
];

/** The table's grid: five columns on a narrow window, all eight on a wide one. */
export const ENDPOINT_GRID =
  "grid grid-cols-[minmax(0,1fr)_40px_60px_112px_70px] gap-3 min-[1184px]:grid-cols-[minmax(0,2.4fr)_60px_72px_72px_minmax(130px,1.4fr)_72px_72px_96px]";

/** A cell only a wide table shows. */
export const WIDE_ONLY = "hidden min-[1184px]:block";
