/**
 * Why a direct call's headers list is shorter than a proxy call's: what sent
 * it adds headers of its own that Courier cannot see. In a browser the Fetch
 * API hides them from the page by design, and DevTools shows them; on a
 * server the HTTP client adds them as it sends, with no DevTools to point
 * at. Which one sent the call is its runtime's kind, unknown once the
 * runtime is gone.
 *
 * @param kind - The kind of runtime that sent the call, when it is still attached
 * @returns The note
 * @example
 * ```ts
 * directHeadersNote("server"); // "A direct call lists the headers your code set; the ones the HTTP client adds as it sends …"
 * ```
 */
export function directHeadersNote(kind: "browser" | "server" | undefined): string {
  const lead = "A direct call lists the headers your code set;";
  if (kind === "browser") {
    return `${lead} the ones the browser adds as it sends — Cookie, User-Agent, Sec-Fetch-* — are hidden from the page by the Fetch API. The browser DevTools Network panel shows the full request.`;
  }
  if (kind === "server") {
    return `${lead} the ones the HTTP client adds as it sends — User-Agent, Accept-Encoding — are not seen by Courier.`;
  }
  return `${lead} the ones the browser or the HTTP client adds as it sends are not seen by Courier.`;
}
