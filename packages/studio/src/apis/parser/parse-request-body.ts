import { declaredEncoding } from "./field-encoding";
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
  /* Stripe gives 298 operations, every GET among them, a form that admits
     no field at all; taken for a map, it became a `body` each call had to
     pass. */
  if (media && admitsNothing(media.schema, spec)) return { requestBody: null };
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

/* An object closed to every field, which only `{}` satisfies. */
function admitsNothing(schema: SpecNode | undefined, spec: SpecNode): boolean {
  const node = schema?.$ref ? resolveRef(spec, schema.$ref) : schema;
  if (node?.additionalProperties !== false) return false;
  if (node.type !== undefined && node.type !== "object") return false;
  const composed = ["allOf", "oneOf", "anyOf"].some((key) => node[key] !== undefined);
  return !composed && Object.keys(node.properties ?? {}).length === 0;
}

/* Only the parts that say how a field is written: a style OpenAPI defines,
   and whether it explodes. */
function fieldEncodings(encoding: SpecNode | undefined): Record<string, FieldEncoding> | undefined {
  if (!encoding) return undefined;
  const fields: Record<string, FieldEncoding> = {};
  for (const [name, entry] of Object.entries(encoding)) {
    const declared = declaredEncoding(entry?.style, entry?.explode);
    if (declared) fields[name] = declared;
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/** The first media type a body declares with no schema, unless it is JSON. */
function schemalessMediaType(content: SpecNode | undefined): string | undefined {
  if (!content || typeof content !== "object") return undefined;
  const [first] = Object.keys(content);
  return first === undefined || /json/i.test(first) ? undefined : first;
}
