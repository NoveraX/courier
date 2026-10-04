import { isRecord } from "../is-record";
import type { MockRequestContext } from "../types";
import { generateRecords } from "./data-generator";
import type { RouteInfo } from "./route-types";
import { extractShape, unwrapArraySchema } from "./schema-introspect";

type Handler = (ctx: MockRequestContext) => unknown;

const TOTAL = new Set(["total", "totalCount", "total_count", "count", "totalItems", "total_items"]);
const PAGE = new Set(["page", "currentPage", "current_page", "pageNumber", "page_number"]);
const SIZE = new Set(["pageSize", "page_size", "perPage", "per_page", "limit", "size", "take"]);
const PAGES = new Set(["totalPages", "total_pages", "pages", "pageCount", "page_count"]);
const MORE = new Set(["hasMore", "has_more", "hasNext", "has_next", "hasNextPage"]);

/**
 * List records in the shape the endpoint declares.
 *
 * A list endpoint answering a pagination wrapper — `{ items, total, page }`,
 * the commonest shape in real APIs — gets the wrapper, which its own response
 * schema accepts, not a bare array: its array field holds the requested page,
 * and the count and page fields it declares describe that page.
 *
 * @param route - The list route, with its response schema
 * @param rows - The records to list, read on each call — a collection's, or none
 * @returns The list handler
 * @example
 * ```ts
 * makeListHandler(route, () => store.collection("pets").getAll());
 * makeListHandler(route, () => []); // an empty page, in the declared shape
 * ```
 */
export function makeListHandler(route: RouteInfo, rows: () => Record<string, unknown>[]): Handler {
  const schema = route.responseSchema;
  const field = schema && !unwrapArraySchema(schema) ? itemsField(schema) : undefined;
  if (!field) return rows;

  const template: Record<string, unknown> = generateRecords(schema, 1)[0] ?? {};
  return (ctx) => {
    const all = rows();
    const { page, pageSize } = requestedPage(ctx.variables, all.length);
    const items = all.slice((page - 1) * pageSize, page * pageSize);
    const totalPages = pageSize > 0 ? Math.ceil(all.length / pageSize) : 0;
    const wrapper: Record<string, unknown> = { ...template, [field]: items };
    for (const key of Object.keys(wrapper)) {
      if (TOTAL.has(key)) wrapper[key] = all.length;
      else if (PAGE.has(key)) wrapper[key] = page;
      else if (SIZE.has(key)) wrapper[key] = pageSize;
      else if (PAGES.has(key)) wrapper[key] = totalPages;
      else if (MORE.has(key)) wrapper[key] = page < totalPages;
    }
    return wrapper;
  };
}

/** The wrapper's one array-of-objects field — the items — if it has exactly one */
function itemsField(schema: unknown): string | undefined {
  const shape = extractShape(schema);
  if (!shape) return undefined;
  const fields = Object.entries(shape).filter(([, field]) => {
    const element = unwrapArraySchema(field);
    return element !== undefined && extractShape(element) !== undefined;
  });
  return fields.length === 1 ? fields[0]?.[0] : undefined;
}

/** The page asked for — `page` and a page size by any of its usual names — or all of it */
function requestedPage(variables: unknown, total: number): { page: number; pageSize: number } {
  const vars: Record<string, unknown> = isRecord(variables) ? variables : {};
  const size = [...SIZE].map((key) => vars[key]).find((value) => typeof value === "number");
  const pageSize = typeof size === "number" && size >= 0 ? size : total;
  const asked = [...PAGE].map((key) => vars[key]).find((value) => typeof value === "number");
  const page = typeof asked === "number" && asked >= 1 ? Math.floor(asked) : 1;
  return { page, pageSize };
}
