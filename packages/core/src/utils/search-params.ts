/** A request's query: a string, a `URLSearchParams`, or a record of its values. */
export type RequestQuery = string | URLSearchParams | Record<string, string>;

/**
 * A request's address with its query: `searchParams` after a `?`, or after
 * an `&` where the address holds a query already.
 *
 * @param url - The address
 * @param searchParams - The query to add, if any
 * @returns The address the request is sent to
 * @example
 * ```ts
 * withSearchParams("https://api.example.com/users?page=2", { sort: "name" }); // "https://api.example.com/users?page=2&sort=name"
 * ```
 */
export function withSearchParams(url: string, searchParams: RequestQuery | undefined): string {
  if (!searchParams) return url;
  const query =
    searchParams instanceof URLSearchParams
      ? searchParams.toString()
      : typeof searchParams === "string"
        ? searchParams
        : new URLSearchParams(searchParams).toString();
  return query ? `${url}${url.includes("?") ? "&" : "?"}${query}` : url;
}
