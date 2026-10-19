import { firstSchemaIn } from "./media-schemas";
import { fieldOf, isNode, nodeAt, type SpecNode, textAt } from "./spec-node";
import type { ParsedEndpoint } from "./types";
import { followedRef } from "./unresolved-refs";
import { convertSchemaInline } from "./utils";

/** `200`, `204`, and the `2XX` wildcard in either case. */
const SUCCESS_CODE = /^2(?:\d\d|XX)$/i;

/** Statuses HTTP forbids a body, whatever the specification declares for them. */
const BODILESS_CODES = new Set(["204", "205"]);

/**
 * What an operation answers with on success: the schema that describes it,
 * and the media type it comes as — JSON when a JSON schema is declared, else
 * the first media type with a schema, else the first declared at all, so a
 * CSV export or a PDF is known for what it is though it has no schema.
 *
 * @param op - The operation
 * @param spec - The whole specification, for references
 * @returns The response's schema, `null` when none is declared, and its media type
 * @example
 * ```ts
 * parseResponse({ responses: { 200: { content: { "text/csv": {} } } } }, spec);
 * // → { responseSchema: null, responseMediaType: "text/csv" }
 * ```
 */
export function parseResponse(
  op: SpecNode,
  spec: SpecNode,
): Pick<ParsedEndpoint, "responseSchema" | "responseMediaType"> {
  const success = successResponse(fieldOf(op, "responses"));
  if (!success) return { responseSchema: null };
  const ref = textAt(success, "$ref");
  const resp = ref ? followedRef(spec, ref, "its answer is read as unknown") : success;
  const media = firstSchemaIn(fieldOf(resp, "content"));
  if (media) {
    return {
      responseSchema: convertSchemaInline(media.schema, spec),
      responseMediaType: media.mediaType,
    };
  }
  const content = nodeAt(resp, "content");
  const [declared] = content ? Object.keys(content) : [];
  return declared === undefined
    ? { responseSchema: null }
    : { responseSchema: null, responseMediaType: declared };
}

/**
 * The response a caller gets on success.
 *
 * The lowest declared 2xx code is the one described, and the `2XX` wildcard
 * only when no code is named. `default` covers every status the operation
 * does not declare, so it describes success only when no 2xx is declared at
 * all: Box and DigitalOcean answer a delete with `204` beside a `default`
 * error, and reading the error as the success made every successful delete
 * fail validation.
 */
function successResponse(responses: unknown): unknown {
  if (!isNode(responses)) return undefined;
  const [code] = Object.keys(responses)
    .filter((key) => SUCCESS_CODE.test(key) && responses[key])
    .sort();
  if (code === undefined) return responses.default || undefined;
  return BODILESS_CODES.has(code) ? undefined : responses[code];
}
