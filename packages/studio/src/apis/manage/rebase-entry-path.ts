import { isRecord } from "../../server/mocks-edit/is-record";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";

/* What the entry is wrapped in to be parsed, before its first character. */
const OPENING = "({ ";

/**
 * The segments of a URL path as core joins a prefix and a path: slashes
 * collapsed, none leading or trailing.
 *
 * @param path - A prefix or a path
 * @returns Its segments
 * @example
 * ```ts
 * pathSegments("/v1//customers/"); // ["v1", "customers"]
 * ```
 */
export function pathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/**
 * Write a generated endpoint's path relative to the prefix its group file
 * declares instead of the one it was generated under, so it calls the same
 * URL: `endpoint.get(":id")` under "/v1/customers" becomes
 * `endpoint.get("customers/:id")` under "/v1".
 *
 * @param code - The endpoint's entry, as a property: `getCustomer: endpoint.get(":id")…`
 * @param bases - The names the file calls its builders by: `endpoint`, `stream`, `api.endpoint`
 * @param generatedPrefix - The prefix it was generated under
 * @param filePrefix - The prefix the group file declares
 * @returns The entry with its path rewritten, or `null` when its URL is not under `filePrefix` or its path is not a string
 * @example
 * ```ts
 * rebaseEntryPath('getCustomer: endpoint.get(":id")', ["endpoint"], "/v1/customers", "/v1");
 * // 'getCustomer: endpoint.get("customers/:id")'
 * ```
 */
export function rebaseEntryPath(
  code: string,
  bases: readonly string[],
  generatedPrefix: string,
  filePrefix: string,
): string | null {
  const path = pathOfEntry(code, bases);
  if (path === null) return null;
  const full = [...pathSegments(generatedPrefix), ...pathSegments(path.value)];
  const own = pathSegments(filePrefix);
  if (own.some((segment, at) => full[at] !== segment)) return null;
  const rest = JSON.stringify(full.slice(own.length).join("/"));
  const at = path.start - OPENING.length;
  return `${code.slice(0, at)}${rest}${code.slice(path.end - OPENING.length)}`;
}

/**
 * The URL path an endpoint's entry calls, from the API's base URL: its
 * group's prefix joined with its own path, as core joins them.
 *
 * @param code - The endpoint's entry, as a property
 * @param bases - The names the file calls its builders by: `endpoint`, `stream`, `api.endpoint`
 * @param prefix - The prefix of the group it is in
 * @returns The path, without a leading slash, or `null` when the entry's path is not a string
 * @example
 * ```ts
 * entryUrl('getCustomer: endpoint.get(":id")', ["endpoint"], "/v1/customers"); // "v1/customers/:id"
 * ```
 */
export function entryUrl(code: string, bases: readonly string[], prefix: string): string | null {
  const path = pathOfEntry(code, bases);
  return path === null ? null : [...pathSegments(prefix), ...pathSegments(path.value)].join("/");
}

/* The path an entry's builder call is given, with its span in the entry. */
function pathOfEntry(
  code: string,
  bases: readonly string[],
): { value: string; start: number; end: number } | null {
  const parsed = parseSource("entry.ts", `${OPENING}${code} });`);
  return parsed.problem === null ? builderPath(parsed.program.body, bases) : null;
}

/* The string the endpoint builder is called with: the path in `base.get("…")`. */
function builderPath(
  node: unknown,
  bases: readonly string[],
): { value: string; start: number; end: number } | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = builderPath(item, bases);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isRecord(node)) return null;
  if (node.type === "CallExpression" && calls(node.callee, bases)) {
    const [first] = Array.isArray(node.arguments) ? node.arguments : [];
    return isRecord(first) &&
      first.type === "Literal" &&
      typeof first.value === "string" &&
      typeof first.start === "number" &&
      typeof first.end === "number"
      ? { value: first.value, start: first.start, end: first.end }
      : null;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    const found = builderPath(value, bases);
    if (found !== null) return found;
  }
  return null;
}

/* A builder named by an identifier, `endpoint`, or reached through the base
   kept whole, `api.endpoint`. */
function calls(callee: unknown, bases: readonly string[]): boolean {
  if (!isRecord(callee) || callee.type !== "MemberExpression") return false;
  const object = dottedName(callee.object);
  return object !== null && bases.includes(object);
}

function dottedName(node: unknown): string | null {
  if (!isRecord(node)) return null;
  if (node.type === "Identifier" && typeof node.name === "string") return node.name;
  if (node.type !== "MemberExpression" || node.computed === true) return null;
  const object = dottedName(node.object);
  const property = isRecord(node.property) ? node.property.name : null;
  return object !== null && typeof property === "string" ? `${object}.${property}` : null;
}
