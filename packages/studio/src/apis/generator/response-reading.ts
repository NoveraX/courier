import type { ParsedEndpoint } from "../parser/types";

/** How a generated endpoint reads its answer: as JSON, as text, or as a blob. */
export type ResponseReading = "json" | "text" | "blob";

const JSON_LINES = /ndjson|jsonl|json-seq/;
const TEXT = /^text\/|xml|yaml|javascript|csv|x-www-form-urlencoded/;

/**
 * How an endpoint's answer is read, from the media type it comes as: JSON
 * for a JSON type, or none; text for text, XML, YAML, CSV, a form, and JSON
 * written one value per line, which no single parse reads; a blob for
 * anything else — a PDF, an image, `application/octet-stream`.
 *
 * @param ep - The endpoint
 * @returns How its answer is read
 * @example
 * ```ts
 * responseReading({ ...exportReport, responseMediaType: "text/csv" }); // → "text"
 * ```
 */
export function responseReading(ep: ParsedEndpoint): ResponseReading {
  const media = (ep.responseMediaType ?? "application/json").toLowerCase();
  /* A wildcard, as springdoc writes for every JSON answer, says nothing
     against JSON; nor does a stream of events, which is read as a stream. */
  if (media.includes("*") || media.startsWith("text/event-stream")) return "json";
  if (JSON_LINES.test(media)) return "text";
  if (media.includes("json")) return "json";
  return TEXT.test(media) ? "text" : "blob";
}

/**
 * Whether an endpoint is a stream of events a client subscribes to: a GET
 * whose success answer is `text/event-stream`, and nothing it could read
 * whole. A POST that answers with events has no stream builder to address
 * it, and stays an HTTP endpoint.
 *
 * @param ep - The endpoint
 * @returns Whether it is generated as `stream.get(…)`
 * @example
 * ```ts
 * isEventStream({ ...watchOrders, httpMethod: "get", responseMediaType: "text/event-stream" }); // → true
 * ```
 */
export function isEventStream(ep: ParsedEndpoint): boolean {
  const media = (ep.responseMediaType ?? "").toLowerCase();
  return ep.httpMethod === "get" && media.startsWith("text/event-stream");
}
