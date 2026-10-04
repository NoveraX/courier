import type { RequestEntry } from "@/store/types";
import { isCredentialHeader } from "./credential-headers";

/** A header as the Headers tab lists it. */
export interface HeaderRow {
  name: string;
  value: string;
  /** Whether it carries a credential, hidden until asked. */
  secret: boolean;
}

/** The headers of one side of a request. */
export interface HeaderGroup {
  key: "response" | "request" | "middleware";
  title: string;
  rows: HeaderRow[];
  /** How many headers the side has, before the filter. */
  total: number;
}

function rowsOf(headers: Readonly<Record<string, string>> | undefined): HeaderRow[] {
  return Object.entries(headers ?? {}).map(([name, value]) => ({
    name,
    value,
    secret: isCredentialHeader(name),
  }));
}

function joined(headers: RequestEntry["middlewareHeaders"]): Record<string, string> | undefined {
  if (!headers) return undefined;
  return Object.fromEntries(
    Object.entries(headers).map(([name, values]) => [name, values.join(", ")]),
  );
}

/**
 * A request's headers by side — the answer's, the request's, and the ones
 * middleware added when any did — each narrowed to the ones whose name or
 * value holds the filter.
 *
 * @param r - The request
 * @param filter - What a header's name or value must hold
 * @returns The groups
 * @example
 * ```ts
 * headerGroupsOf(request, "content").map((g) => g.rows.length); // [1, 0]
 * ```
 */
export function headerGroupsOf(
  r: Pick<RequestEntry, "headers" | "requestHeaders" | "middlewareHeaders">,
  filter: string,
): HeaderGroup[] {
  const query = filter.trim().toLowerCase();
  const groups: Omit<HeaderGroup, "total">[] = [
    { key: "response", title: "Response headers", rows: rowsOf(r.headers) },
    { key: "request", title: "Request headers", rows: rowsOf(r.requestHeaders) },
  ];
  const added = joined(r.middlewareHeaders);
  if (added && Object.keys(added).length > 0) {
    groups.push({ key: "middleware", title: "Added by middleware", rows: rowsOf(added) });
  }
  return groups.map((group) => ({
    ...group,
    total: group.rows.length,
    rows: query
      ? group.rows.filter((row) => `${row.name} ${row.value}`.toLowerCase().includes(query))
      : group.rows,
  }));
}

/**
 * How many headers a request has, on every side.
 *
 * @param r - The request
 * @returns The count
 * @example
 * ```ts
 * headerCount(request); // 12
 * ```
 */
export function headerCount(
  r: Pick<RequestEntry, "headers" | "requestHeaders" | "middlewareHeaders">,
): number {
  return headerGroupsOf(r, "").reduce((sum, group) => sum + group.total, 0);
}

/**
 * Headers as lines of `name: value`, to copy.
 *
 * @param rows - The headers
 * @returns The text
 * @example
 * ```ts
 * headersAsText([{ name: "accept", value: "application/json", secret: false }]); // "accept: application/json"
 * ```
 */
export function headersAsText(rows: readonly HeaderRow[]): string {
  return rows.map((row) => `${row.name}: ${row.value}`).join("\n");
}
