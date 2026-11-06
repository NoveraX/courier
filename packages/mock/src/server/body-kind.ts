import { logger } from "@noverax/courier";
import {
  BodyError,
  formOf as formSentFor,
  RECORD_UPLOAD_TYPE,
  readMultipartForm,
  readRecordUpload,
} from "@noverax/courier/internal";

import { sizeLabel } from "../uploads/size-label";

/**
 * What a request body holds, by its content type: JSON, a form — multipart
 * or URL-encoded — a proxy client's record upload, raw bytes of any other
 * type, or a body to be told by what it holds: one with no type, or plain
 * text, which is what `fetch` calls a string body it is given no type for.
 */
export type BodyKind = "json" | "form" | "record" | "raw" | "sniffed";

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
  if (type === RECORD_UPLOAD_TYPE) return "record";
  if (type === "application/json" || type.endsWith("+json")) return "json";
  return "raw";
}

/* The whole body, its pieces joined once it has all arrived. */
async function bytesOf(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const pieces: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  for await (const piece of body) {
    pieces.push(piece);
    total += piece.byteLength;
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const piece of pieces) {
    bytes.set(piece, at);
    at += piece.byteLength;
  }
  return bytes;
}

/* A multipart form, parsed as it arrives as a Courier server parses one; a URL-encoded one, read whole. */
async function formOf(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  contentType: string,
  fieldLimit: number,
): Promise<FormData> {
  if (essence(contentType) !== "multipart/form-data") {
    const form = new FormData();
    const fields = new URLSearchParams(new TextDecoder().decode(await bytesOf(body)));
    for (const [name, value] of fields) form.append(name, value);
    return form;
  }
  return readMultipartForm(body, contentType, { maxFieldBytes: fieldLimit });
}

const NOT_JSON = Symbol("not JSON");

function jsonOf(text: string): unknown {
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    logger.debug("MockServer", "A JSON body could not be parsed", error);
    return NOT_JSON;
  }
}

/* A record upload as a Courier proxy passes it on — as a direct call sends its record — so a
   handler is given what a direct call gives it: a record that holds a file as the form sent for
   it, its options in the first `_options` field, as a proxy client writes a form's; one that
   holds none as JSON. */
function sentAs(
  variables: Record<string, unknown>,
  options: string | undefined,
): ParsedBody | { error: string; status: 400 } {
  const sent = formSentFor(variables);
  if (sent === undefined) {
    const parsed = jsonOf(options ?? "");
    return parsed === NOT_JSON
      ? { error: "_options must be a JSON string", status: 400 }
      : { kind: "json", value: { variables, options: parsed } };
  }
  const form = new FormData();
  form.append("_options", options ?? "");
  for (const [name, value] of sent) form.append(name, value);
  return { kind: "form", form };
}

/**
 * Read a body for what it holds. JSON is parsed and a form's fields read —
 * a multipart form by Courier's own parser, as it arrives, its text held to
 * `jsonLimit` and its files kept in memory; a proxy client's record upload
 * by its parser too, to the same limits, and given as what a direct call
 * sends for its record; raw bytes are kept as a `Blob` of their type. A
 * body with no type, or of plain text, is read as JSON when it is JSON — as
 * a `fetch` given a JSON string and no type sends it — and refused with 413
 * when that JSON is larger than `jsonLimit`; any other is raw bytes, as a
 * `fetch` of an `ArrayBuffer` or an untyped `Blob` sends them. RFC 9110
 * lets a server look at such a body to tell.
 *
 * @param body - The body, held to its limits
 * @param contentType - The request's `Content-Type`, or `""`
 * @param jsonLimit - The largest body read as JSON, and the most text a form holds
 * @returns What it holds, or why it could not be read
 * @throws BodyError — the body's own refusal — for one the form's limits, or its reading, refused
 * @example
 * ```ts
 * await parseBody(body, "image/png", 1_048_576); // { kind: "raw", blob: Blob }
 * await parseBody(body, "text/plain;charset=UTF-8", 1_048_576); // { kind: "json", value: {…} }
 * ```
 */
export async function parseBody(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  contentType: string,
  jsonLimit: number,
): Promise<ParsedBody | { error: string; status: 400 | 413 }> {
  const kind = bodyKindOf(contentType);
  if (kind === "record") {
    try {
      const read = await readRecordUpload(body, contentType, { maxFieldBytes: jsonLimit });
      return sentAs(read.variables, read.options);
    } catch (error) {
      if (!(error instanceof BodyError) || error.code !== "BODY_MALFORMED") throw error;
      logger.debug("MockServer", "A record upload could not be parsed", error);
      return { error: error.message, status: 400 };
    }
  }
  if (kind === "form") {
    try {
      return { kind, form: await formOf(body, contentType, jsonLimit) };
    } catch (error) {
      if (!(error instanceof BodyError) || error.code !== "BODY_MALFORMED") throw error;
      logger.debug("MockServer", "A form body could not be parsed", error);
      return { error: "The form body could not be read", status: 400 };
    }
  }
  const bytes = await bytesOf(body);
  const blob = (): Blob => new Blob([bytes], { type: essence(contentType) });
  if (kind === "raw") return { kind, blob: blob() };
  const value = jsonOf(new TextDecoder().decode(bytes));
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
