import type { RequestEntry } from "@/store/types";

/** Which body of a request: the one it sent, or the one it was answered with. */
export type RequestBodyPart = "request" | "response";

/**
 * The file a request's whole body downloads as, named after its endpoint —
 * the name its snippets read the body from when it is too large to write out.
 *
 * @param r - The request
 * @param part - Which of its bodies
 * @returns The file's name
 * @example
 * ```ts
 * requestBodyFile({ source: "api", group: "orders", method: "create" }, "request"); // → "api.orders.create-request.json"
 * ```
 */
export function requestBodyFile(
  r: Pick<RequestEntry, "source" | "group" | "method">,
  part: RequestBodyPart,
): string {
  const name = [r.source, r.group, r.method].filter(Boolean).join(".") || "request";
  return `${name}-${part}.json`;
}
