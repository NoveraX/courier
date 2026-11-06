/**
 * How a call's variables are written into a request: one set of rules for a
 * direct call, for the server behind the proxy, and for a page's proxy client
 * checking a call before it is sent.
 *
 * A record — named values — goes as JSON, unless one of its fields holds a
 * file: then as a form, written as OpenAPI writes `multipart/form-data` by
 * default. A string is a field; a number, a boolean or a date is a field of
 * its text; an object is a field of its JSON; a `Blob` or a `File` is a file,
 * bytes are a file of their own; a list is a part for each item. What no form
 * of the request carries is refused, with where it sits and not what it holds:
 * a file deeper than a field or a list's item, a stream inside a record, a
 * `Set` or a `Map`, which JSON writes as `{}`.
 */

import { ConfigurationError } from "../errors/configuration-error";

/** Where a file sits in a record a form carries: its field, and its item in a list there. */
export type FilePlace = readonly [field: string] | readonly [field: string, item: number];

/** A part of the form a record goes as: text, or a file. */
export interface FormEntry<TFile = Blob> {
  readonly name: string;
  readonly value: string | TFile;
  /** Where the value sat in the record: a proxy that restores the record puts a file back there */
  readonly at: FilePlace;
}

/** What a form takes as a file at a place of the record, or `undefined` for a value it writes as text. */
export type FileOf<TFile> = (value: unknown, at: FilePlace) => TFile | undefined;

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isBytes(value: unknown): value is ArrayBuffer | ArrayBufferView {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function isStream(value: unknown): boolean {
  return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
}

/**
 * Whether a form carries a value as a file: a `Blob`, or bytes.
 *
 * @param value - A value of the variables
 * @returns `true` for a file
 * @example
 * ```ts
 * isFile(new Uint8Array([1])); // → true
 * ```
 */
export function isFile(value: unknown): value is Blob | ArrayBuffer | ArrayBufferView {
  return isBlob(value) || isBytes(value);
}

/* A file as the form takes it: a Blob as it is, bytes as a Blob of their own. */
function blobOf(value: unknown): Blob | undefined {
  if (isBlob(value)) return value;
  return isBytes(value) ? new Blob([ownBytes(value)]) : undefined;
}

/* Why a stream is refused anywhere but as the whole body. */
const NO_STREAM_PART = "a form's part is no stream; send it as the body";

/** Why a file is refused where a request sends its variables in its address. */
export const ADDRESS_HOLDS_TEXT = "an address holds text; send a file with a verb that has a body";

function refuse(at: string, what: string, instead: string): never {
  throw new ConfigurationError(
    "VARIABLE_NOT_ENCODABLE",
    `[courier] ${at} is ${what}, which the request cannot carry: ${instead}`,
  );
}

/**
 * Refuse what JSON would lose from a value: binary data, which it writes as
 * `{}` or as numbered fields, and a `Set` or a `Map`, which it writes as `{}`.
 * A value with a `toJSON` of its own is written as that says, and not looked into.
 *
 * @param value - The value
 * @param at - Where it sits, for the message: `variables.meta`
 * @param binary - What to suggest for binary data found there
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` naming the first such value
 * @example
 * ```ts
 * assertJsonValue({ tags: new Set(["a"]) }, "variables"); // throws: variables.tags is a Set
 * ```
 */
export function assertJsonValue(
  value: unknown,
  at: string,
  binary = "a form carries a file in a field of the variables, or in a list there",
  seen: Set<object> = new Set(),
): void {
  if (isStream(value)) refuse(at, "a stream", NO_STREAM_PART);
  if (isFile(value)) refuse(at, "binary data", binary);
  if (value instanceof Set) refuse(at, "a Set", "JSON writes it as {}; send a list");
  if (value instanceof Map) refuse(at, "a Map", "JSON writes it as {}; send an object");
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  if (typeof Reflect.get(value, "toJSON") === "function") return;
  seen.add(value);
  const members: Array<[string, unknown]> = Object.entries(value);
  for (const [key, child] of members) {
    assertJsonValue(child, Array.isArray(value) ? `${at}[${key}]` : `${at}.${key}`, binary, seen);
  }
}

/**
 * Whether a record goes as a form: one of its fields, or an item of a list
 * there, is a file.
 *
 * @param record - The variables
 * @returns `true` when a form carries them
 * @example
 * ```ts
 * holdsFile({ title: "T", cover: new Blob(["png"]) }); // → true
 * ```
 */
export function holdsFile(record: Record<string, unknown>): boolean {
  return Object.values(record).some((value) =>
    Array.isArray(value) ? value.some(isFile) : isFile(value),
  );
}

/**
 * The parts of the form a record goes as, in the order of its fields: a
 * field `undefined` or `null` is left out, as a form has no such value.
 *
 * @param record - The variables, a file in one of their fields
 * @param fileOf - What is a file, at its place; a `Blob` or bytes unless given
 * @returns Each part, with where it sat
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for a value no part carries
 * @example
 * ```ts
 * formEntries({ title: "T", tags: ["a", "b"] }).map((entry) => entry.value); // → ["T", "a", "b"]
 * ```
 */
export function formEntries(record: Record<string, unknown>): FormEntry[];
export function formEntries<TFile>(
  record: Record<string, unknown>,
  fileOf: FileOf<TFile>,
): FormEntry<TFile>[];
export function formEntries(
  record: Record<string, unknown>,
  fileOf: FileOf<unknown> = blobOf,
): FormEntry<unknown>[] {
  const entries: FormEntry<unknown>[] = [];
  const add = (name: string, value: unknown, at: FilePlace, path: string): void => {
    const file = fileOf(value, at);
    const part = file === undefined ? textOf(value, path) : file;
    if (part !== undefined) entries.push({ name, value: part, at });
  };
  for (const [name, value] of Object.entries(record)) {
    if (!Array.isArray(value)) {
      add(name, value, [name], `variables.${name}`);
      continue;
    }
    value.forEach((item: unknown, index) => {
      add(name, item, [name, index], `variables.${name}[${index}]`);
    });
  }
  return entries;
}

/* A value as a form's text part. */
function textOf(value: unknown, at: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (isStream(value)) refuse(at, "a stream", NO_STREAM_PART);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  assertJsonValue(value, at, "a form sends an object as JSON; give the file a field of its own");
  return JSON.stringify(value);
}

/* Bytes as a Blob takes them: a view over shared memory is copied out, any other kept. */
function ownBytes(value: ArrayBuffer | ArrayBufferView): ArrayBuffer | Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) return value;
  const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return isOwned(view) ? view : view.slice();
}

function isOwned(view: Uint8Array): view is Uint8Array<ArrayBuffer> {
  return view.buffer instanceof ArrayBuffer;
}

/**
 * The form a record goes as, or `undefined` for one that holds no file.
 *
 * @param record - The variables
 * @returns The form, its parts as `formEntries` writes them
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for a value no part carries
 * @example
 * ```ts
 * formOf({ title: "T", cover: file })?.get("cover"); // → file
 * ```
 */
export function formOf(record: Record<string, unknown>): FormData | undefined {
  return holdsFile(record) ? multipartForm(record) : undefined;
}

/**
 * The form a record goes as, whether a file is among its fields or not.
 *
 * @param record - The variables
 * @returns The form, its parts as `formEntries` writes them
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for a value no part carries
 * @example
 * ```ts
 * multipartForm({ title: "T", pages: 3 }).get("pages"); // → "3"
 * ```
 */
export function multipartForm(record: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const { name, value } of formEntries(record)) form.append(name, value);
  return form;
}

/**
 * The text fields of a form, for a request that sends its variables in its
 * address, as a browser sends a form whose method is GET: a name given more
 * than once is a list.
 *
 * @param form - The variables
 * @returns The fields by name
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for a file, which an address cannot hold
 * @example
 * ```ts
 * formFields(form); // → { q: "boots", size: ["41", "42"] }
 * ```
 */
export function formFields(form: FormData): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {};
  for (const [name, value] of form) {
    if (typeof value !== "string") refuse(`variables.${name}`, "a file", ADDRESS_HOLDS_TEXT);
    const held = fields[name];
    fields[name] = held === undefined ? value : [...(Array.isArray(held) ? held : [held]), value];
  }
  return fields;
}
