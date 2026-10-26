/**
 * Path manipulation utilities for OpenAPI/Postman parsers.
 */

import { escapePathText } from "@noverax/courier/internal";

import { transliterate } from "./naming-utils";
import { gatheredPaths, sharedPrefix } from "./shared-path";

/* A path parameter's placeholder, `+` before the name of one whose value keeps its slashes, as
   Google's `{+name}` writes it; its name holds no brace and no slash. */
const PLACEHOLDER = /\{(\+?)([^{}/]+)\}/g;

/* One placeholder, whole, to split a segment around. */
const ONE_PLACEHOLDER = /(\{\+?[^{}/]+\})/;

/* What a `:name` placeholder reads as part of its name. */
const NAME_CHARACTER = /[A-Za-z0-9_]/;

/**
 * The path an endpoint declares, from a specification's path: each
 * placeholder `{id}` becomes `:id` — or stays `{id}` where text a name
 * could take in follows it at once — Google's `{+name}` stays a parameter
 * whose value keeps its slashes, a segment Postman starts with a colon is
 * its path variable as it is, and every other colon is doubled, so that the
 * endpoint sends it as written.
 *
 * @param path - The path, as the specification writes it
 * @returns The path, as the generated endpoint writes it
 * @example
 * ```ts
 * convertPathParams("/v4/spreadsheets/{spreadsheetId}:batchUpdate"); // → "/v4/spreadsheets/:spreadsheetId::batchUpdate"
 * convertPathParams("/v1/{+name}:cancel"); // → "/v1/{+name}::cancel"
 * convertPathParams("/files/{id}abc"); // → "/files/{id}abc"
 * ```
 */
export function convertPathParams(path: string): string {
  return path.split("/").map(convertSegment).join("/");
}

function convertSegment(segment: string): string {
  if (segment.startsWith(":")) return segment;
  const parts = segment.split(ONE_PLACEHOLDER);
  return parts
    .map((part, at) =>
      at % 2 === 1 ? placeholderOf(part, parts[at + 1] ?? "") : escapePathText(part),
    )
    .join("");
}

/* A placeholder as the endpoint's path writes it, given the text after it. */
function placeholderOf(placeholder: string, after: string): string {
  const keepsSlashes = placeholder.startsWith("{+");
  const name = pathParamName(placeholder.slice(keepsSlashes ? 2 : 1, -1));
  if (keepsSlashes) return `{+${name}}`;
  return NAME_CHARACTER.test(after.charAt(0)) ? `{${name}}` : `:${name}`;
}

/**
 * The name a path parameter takes in the path and in the variables.
 *
 * A placeholder is read from a letter or `_` up to the first character that
 * cannot be part of an identifier, so `:file-id` would name `file` and
 * `:1st` nothing at all. A letter it transliterates is spelled in Latin, any
 * other character an identifier cannot hold becomes `_`, and a name that
 * starts with a digit gains a leading `_`. The value still fills the same
 * segment, so nothing on the wire changes.
 *
 * @param name - The parameter's name as the specification writes it
 * @returns The name the generated path and variables use
 * @example
 * ```ts
 * pathParamName("file-id"); // → "file_id"
 * pathParamName("1st"); // → "_1st"
 * ```
 */
export function pathParamName(name: string): string {
  const spelled = transliterate(name).replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(spelled) ? spelled : `_${spelled}`;
}

/**
 * Why a path template cannot be written as a Courier path, if it cannot:
 * two parameters whose names come out as one.
 *
 * @param path - The path, as the specification writes it
 * @returns The reason its operations are left out, or `undefined` for a path that can be written
 * @example
 * ```ts
 * unwritablePath("/a/{a-b}/{a_b}"); // → "its parameters {a-b} and {a_b} would both be named a_b, …"
 * unwritablePath("/items/{id}5"); // → undefined
 * ```
 */
export function unwritablePath(path: string): string | undefined {
  const written = new Map<string, string>();
  for (const match of path.matchAll(PLACEHOLDER)) {
    const given = match[2] ?? "";
    const name = pathParamName(given);
    const other = written.get(name);
    if (other !== undefined && other !== given) {
      return `its parameters {${other}} and {${given}} would both be named ${name}, so its operations are left out`;
    }
    written.set(name, given);
  }
  return undefined;
}

/** Extract path from Postman URL (strip protocol, host, query) */
export function extractPostmanPath(url: string): string {
  try {
    const u = new URL(url.replace(/\{\{.*?\}\}/g, "localhost"));
    return u.pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

/**
 * The prefix a group of paths takes: the parent of a lone path, or what
 * several share up to their first parameter — `/` when that is nothing.
 * Each path is read once, however many there are.
 *
 * @param paths - The group's paths, as the specification writes them
 * @returns The prefix, starting with `/`
 * @example
 * ```ts
 * findCommonPrefix(["/pets", "/pets/{id}"]); // → "/pets"
 * findCommonPrefix(["/pets/{id}/toys"]); // → "/pets/{id}"
 * ```
 */
export function findCommonPrefix(paths: readonly string[]): string {
  return sharedPrefix(gatheredPaths(paths));
}
