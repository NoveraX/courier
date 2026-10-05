import type { MockRequestLog } from "@/store/mock-slice";

/** Which body of a request: the one it sent, or the one it was answered with. */
export type BodyPart = "request" | "response";

/**
 * The file a request's whole body downloads as, named after its endpoint —
 * the name its cURL reads the body from when it is too large to write out.
 *
 * @param log - The request the mock logged
 * @param part - Which of its bodies
 * @returns The file's name
 * @example
 * ```ts
 * wholeBodyFile({ group: "orders", endpoint: "create", ... }, "request"); // → "orders.create-request.json"
 * ```
 */
export function wholeBodyFile(
  log: Pick<MockRequestLog, "group" | "endpoint">,
  part: BodyPart,
): string {
  const name = [log.group, log.endpoint].filter(Boolean).join(".") || "mock";
  return `${name}-${part}.json`;
}
