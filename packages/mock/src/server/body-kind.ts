import { logger } from "@noverax/courier";

import { sizeLabel } from "../uploads/size-label";

/**
 * What a request body holds, by its content type: JSON, a form — multipart
 * or URL-encoded — raw bytes of any other type, or a body to be told by
 * what it holds: one with no type, or plain text, which is what `fetch`
 * calls a string body it is given no type for.
 */
export type BodyKind = "json" | "form" | "raw" | "sniffed";

/** A body read for what it holds: JSON parsed, a form's fields, raw bytes as a `Blob` of their type. */
export type ParsedBody =
  | { kind: "json"; value: unknown }
  | { kind: "form"; form: FormData }
  | { kind: "raw"; blob: Blob };

const FORM_TYPES: ReadonlySet<string> = new Set([
  "multipart/form-data",
  "application/x-www-form-urlencoded",
]);

/* A content type without its parameters, in lower case. */
function essence(contentType: string): string {
  return (contentType.split(";")[0] ?? "").trim().toLowerCase();
}

/**
 * The kind of body a content type declares. JSON is `application/json` or
 * any `+json` type; a form is multipart or URL-encoded; no type and
 * `text/plain` are told by what they hold; any other type is raw bytes — a
 * file, an image, a PDF.
 *
 * @param contentType - The request's `Content-Type`, or `""`
 * @returns Its kind
 * @example
 * ```ts
 * bodyKindOf("application/merge-patch+json"); // "json"
 * bodyKindOf("image/png"); // "raw"
 * ```
 */
export function bodyKindOf(contentType: string): BodyKind {
  const type = essence(contentType);
  if (type === "" || type === "text/plain") return "sniffed";
  if (FORM_TYPES.has(type)) return "form";
  if (type === "application/json" || type.endsWith("+json")) return "json";
  return "raw";
}

async function formOf(bytes: Uint8Array<ArrayBuffer>, contentType: string) {
  try {
    /* The platform parses the form; the content type carries a multipart boundary. */
    return await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch (error) {
    logger.debug("MockServer", "A form body could not be parsed", error);
    return undefined;
  }
}

const NOT_JSON = Symbol("not JSON");

function jsonOf(bytes: Uint8Array<ArrayBuffer>): unknown {
  const text = new TextDecoder().decode(bytes);
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    logger.debug("MockServer", "A JSON body could not be parsed", error);
    return NOT_JSON;
  }
}

/**
 * Read a body for what it holds. JSON is parsed and a form's fields read;
 * raw bytes are kept as a `Blob` of their type. A body with no type, or of
 * plain text, is read as JSON when it is JSON — as a `fetch` given a JSON
 * string and no type sends it — and refused with 413 when that JSON is
 * larger than `jsonLimit`; any other is raw bytes, as a `fetch` of an
 * `ArrayBuffer` or an untyped `Blob` sends them. RFC 9110 lets a server look
 * at such a body to tell.
 *
 * @param bytes - The body
 * @param contentType - The request's `Content-Type`, or `""`
 * @param jsonLimit - The largest body read as JSON
 * @returns What it holds, or why it could not be read
 * @example
 * ```ts
 * await parseBody(bytes, "image/png", 1_048_576); // { kind: "raw", blob: Blob }
 * await parseBody(bytes, "text/plain;charset=UTF-8", 1_048_576); // { kind: "json", value: {…} }
 * ```
 */
export async function parseBody(
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
  jsonLimit: number,
): Promise<ParsedBody | { error: string; status: 400 | 413 }> {
  const kind = bodyKindOf(contentType);
  if (kind === "form") {
    const form = await formOf(bytes, contentType);
    return form ? { kind, form } : { error: "The form body could not be read", status: 400 };
  }
  const blob = (): Blob => new Blob([bytes], { type: essence(contentType) });
  if (kind === "raw") return { kind, blob: blob() };
  const value = jsonOf(bytes);
  if (value === NOT_JSON) {
    return kind === "sniffed"
      ? { kind: "raw", blob: blob() }
      : { error: "The request body is not valid JSON", status: 400 };
  }
  /* JSON sent with no type was read up to the upload limit, not knowing it for JSON. */
  if (bytes.byteLength > jsonLimit) {
    return {
      error: `The request body is larger than ${sizeLabel(jsonLimit)}, the most this mock reads`,
      status: 413,
    };
  }
  return { kind: "json", value };
}
