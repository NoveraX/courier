import { sameId } from "./same-id";

/** Pagination and sorting options */
export interface QueryOptions<TItem> {
  take?: number | undefined;
  skip?: number | undefined;
  cursor?: TItem | undefined;
  orderBy?: Partial<Record<keyof TItem, "asc" | "desc">> | undefined;
}

/** Paginated result with metadata */
export interface PaginatedResult<TItem> {
  data: TItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Apply sorting to an array of records */
export function applySorting<TItem>(
  items: TItem[],
  orderBy?: Partial<Record<keyof TItem, "asc" | "desc">>,
): TItem[] {
  if (!orderBy) return items;

  const entries = Object.entries(orderBy) as Array<[keyof TItem, "asc" | "desc"]>;
  if (entries.length === 0) return items;

  return [...items].sort((a, b) => {
    for (const [field, direction] of entries) {
      const aVal = a[field];
      const bVal = b[field];
      const cmp = compare(aVal, bVal);
      if (cmp !== 0) return direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

/** Apply offset/cursor pagination to sorted items */
export function applyPagination<TItem extends Record<string, unknown>>(
  items: TItem[],
  options: QueryOptions<TItem>,
  idField: string,
): PaginatedResult<TItem> {
  const total = items.length;
  let startIndex = options.skip ?? 0;

  /* Cursor-based: start after the cursor's record, matched by id as getById
     matches it, so a cursor read from a URL — "1" — finds record 1. */
  if (options.cursor) {
    const cursorId = options.cursor[idField];
    const cursorIndex = items.findIndex((item) => sameId(item[idField], cursorId));
    if (cursorIndex >= 0) startIndex = cursorIndex + 1;
  }

  const pageSize = options.take ?? total;
  const data = items.slice(startIndex, startIndex + pageSize);
  /* No page holds anything when a page holds nothing — an empty set, or
     `take: 0` — so both report no pages, whether or not `take` was given. */
  const page = pageSize > 0 ? Math.floor(startIndex / pageSize) + 1 : 1;
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;

  return { data, total, page, pageSize, totalPages };
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}
