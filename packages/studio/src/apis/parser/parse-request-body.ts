import { firstSchemaIn } from "./media-schemas";
import type { FieldEncoding, ParsedEndpoint, SpecNode } from "./types";
import { convertSchemaInline, resolveRef } from "./utils";

type ParsedRequestBody = Pick<
  ParsedEndpoint,
  "requestBody" | "requestBodyMediaType" | "requestBodyEncoding"
>;

/**
 * The body an operation sends: its schema, the media type it is sent as,
 * and how each field of a form is written.
 *
 * Stripe sends every body as form-encoded and Twilio does the same; reading
 * only `application/json` dropped all 594 and all 62 of them. Which of the
 * two a body is sent as is kept beside its schema, and so is the `encoding`
 * that says how Stripe's nested fields are written.
 *
 * @param op - The operation
 * @param spec - The whole specification, for references
 * @returns The body's schema, media type and field encodings; a `null` body when there is none
 * @example
 * ```ts
 * parseRequestBody(stripe.paths["/v1/customers"].post, stripe).requestBodyEncoding?.metadata;
 * // → { style: "deepObject", explode: true }
 * ```
 */
export function parseRequestBody(op: SpecNode, spec: SpecNode): ParsedRequestBody {
  if (!op.requestBody) return { requestBody: null };
  const body = op.requestBody.$ref ? resolveRef(spec, op.requestBody.$ref) : op.requestBody;
  const media = firstSchemaIn(body?.content);
  if (media) {
    const encoding = fieldEncodings(media.encoding);
    return {
      requestBody: convertSchemaInline(media.schema, spec),
      requestBodyMediaType: media.mediaType,
      ...(encoding && { requestBodyEncoding: encoding }),
    };
  }
  /* Bytes are often sent with no schema at all; they are still a body. */
  const bytes = schemalessMediaType(body?.content);
  if (bytes === undefined) return { requestBody: null };
  return { requestBody: { name: "Body", type: "any" }, requestBodyMediaType: bytes };
}

/* Only the parts that say how a field is written: a style OpenAPI defines,
   and whether it explodes. */
function fieldEncodings(encoding: SpecNode | undefined): Record<string, FieldEncoding> | undefined {
  if (!encoding) return undefined;
  const fields: Record<string, FieldEncoding> = {};
  for (const [name, entry] of Object.entries(encoding)) {
    const style = styleOf(entry?.style);
    const explode = typeof entry?.explode === "boolean" ? entry.explode : undefined;
    if (style === undefined && explode === undefined) continue;
    fields[name] = { ...(style && { style }), ...(explode !== undefined && { explode }) };
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

function styleOf(value: unknown): FieldEncoding["style"] {
  return value === "form" ||
    value === "spaceDelimited" ||
    value === "pipeDelimited" ||
    value === "deepObject"
    ? value
    : undefined;
}

/** The first media type a body declares with no schema, unless it is JSON. */
function schemalessMediaType(content: SpecNode | undefined): string | undefined {
  if (!content || typeof content !== "object") return undefined;
  const [first] = Object.keys(content);
  return first === undefined || /json/i.test(first) ? undefined : first;
}
