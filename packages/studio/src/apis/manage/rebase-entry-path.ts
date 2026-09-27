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
 * @param base - The name the file calls its endpoint builder by
 * @param generatedPrefix - The prefix it was generated under
 * @param filePrefix - The prefix the group file declares
 * @returns The entry with its path rewritten, or `null` when its URL is not under `filePrefix` or its path is not a string
 * @example
 * ```ts
 * rebaseEntryPath('getCustomer: endpoint.get(":id")', "endpoint", "/v1/customers", "/v1");
 * // 'getCustomer: endpoint.get("customers/:id")'
 * ```
 */
export function rebaseEntryPath(
  code: string,
  base: string,
  generatedPrefix: string,
  filePrefix: string,
): string | null {
  const path = pathOfEntry(code, base);
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
 * @param base - The name the file calls its endpoint builder by
 * @param prefix - The prefix of the group it is in
 * @returns The path, without a leading slash, or `null` when the entry's path is not a string
 * @example
 * ```ts
 * entryUrl('getCustomer: endpoint.get(":id")', "endpoint", "/v1/customers"); // "v1/customers/:id"
 * ```
 */
export function entryUrl(code: string, base: string, prefix: string): string | null {
  const path = pathOfEntry(code, base);
  return path === null ? null : [...pathSegments(prefix), ...pathSegments(path.value)].join("/");
}

/* The path an entry's builder call is given, with its span in the entry. */
function pathOfEntry(
  code: string,
  base: string,
): { value: string; start: number; end: number } | null {
  const parsed = parseSource("entry.ts", `${OPENING}${code} });`);
  return parsed.problem === null ? builderPath(parsed.program.body, base) : null;
}

/* The string the endpoint builder is called with: the path in `base.get("…")`. */
function builderPath(
  node: unknown,
  base: string,
): { value: string; start: number; end: number } | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = builderPath(item, base);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isRecord(node)) return null;
  if (node.type === "CallExpression" && calls(node.callee, base)) {
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
    const found = builderPath(value, base);
    if (found !== null) return found;
  }
  return null;
}

function calls(callee: unknown, base: string): boolean {
  return (
    isRecord(callee) &&
    callee.type === "MemberExpression" &&
    isRecord(callee.object) &&
    callee.object.type === "Identifier" &&
    callee.object.name === base
  );
}
