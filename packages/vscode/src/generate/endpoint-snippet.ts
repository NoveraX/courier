/** The builder methods an endpoint is made with, as `courier()` names them. */
export const METHODS = ["get", "post", "put", "patch", "del", "query"] as const;

/** An endpoint to add: its name in the group, its method and its path. */
export interface NewEndpoint {
  readonly name: string;
  readonly method: (typeof METHODS)[number];
  /** After the group's prefix: `:id`, `search`, or empty */
  readonly path: string;
}

/* A name an object's key and a call in the client can both be, unquoted. */
const NAME = /^[A-Za-z_$][\w$]*$/;
const READS = new Set<NewEndpoint["method"]>(["get", "del", "query"]);

/**
 * Why a name cannot be a new endpoint's, or `undefined` when it can: it is
 * a name the client's calls can use, and the group has none by it yet.
 *
 * @param name - The name typed
 * @param taken - The names the group's endpoints have
 * @returns Why not, or `undefined`
 * @example
 * ```ts
 * nameProblem("place", ["list"]); // undefined
 * nameProblem("place", ["place"]); // "orders already has an endpoint named place"
 * ```
 */
export function nameProblem(name: string, taken: readonly string[]): string | undefined {
  if (!NAME.test(name)) return "A name of letters, digits, _ and $, not starting with a digit";
  return taken.includes(name) ? `The group already has an endpoint named ${name}` : undefined;
}

/**
 * The new endpoint as a snippet to type through: its variables — a field
 * for each variable its path names, or one to name for a write — and its
 * response, each a placeholder, the cursor after it at the end.
 *
 * @param builder - What the file builds endpoints with: `endpoint`
 * @param wanted - The endpoint
 * @returns The snippet's text
 * @example
 * ```ts
 * endpointSnippet("endpoint", { name: "get", method: "get", path: ":id" });
 * // 'get: endpoint.get(":id").variables<${1:{ id: string \\}}>().response<${2:unknown}>(),$0'
 * ```
 */
export function endpointSnippet(builder: string, wanted: NewEndpoint): string {
  const params = [...wanted.path.matchAll(/:([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);
  const fields = params.map((param) => `${param}: string`);
  if (fields.length === 0 && !READS.has(wanted.method)) fields.push("name: string");
  let stop = 1;
  const variables =
    fields.length > 0 ? `.variables<\${${stop++}:{ ${fields.join("; ")} \\}}>()` : "";
  const path = wanted.path.replace(/[\\$}"]/g, (char) => `\\${char}`);
  return `${wanted.name}: ${builder}.${wanted.method}("${path}")${variables}.response<\${${stop}:unknown}>(),$0`;
}

/**
 * Where a new endpoint goes among a group's, and what comes before it: after
 * the last one — past its comma, or with one — on a line of its own at the
 * endpoints' indent; or, in an empty `{}`, on a line between the braces.
 *
 * @param text - The file's text
 * @param offsetAt - The offset of a line and column from 1
 * @param place - Where the group writes its endpoints
 * @param unit - One level of indent, as the editor writes it
 * @returns The offset to insert at, and the text before and after the snippet
 * @example
 * ```ts
 * insertion(text, offsetAt, place, "  ").offset;
 * ```
 */
export function insertion(
  text: string,
  offsetAt: (line: number, column: number) => number,
  place: {
    open: { line: number; column: number };
    last?: { line: number; column: number; comma: boolean } | undefined;
  },
  unit: string,
): { offset: number; before: string; after: string } {
  const openLine = text.split("\n")[place.open.line - 1] ?? "";
  const outer = /^\s*/.exec(openLine)?.[0] ?? "";
  const indent = `${outer}${unit}`;
  if (!place.last) {
    return {
      offset: offsetAt(place.open.line, place.open.column) + 1,
      before: `\n${indent}`,
      after: `\n${outer}`,
    };
  }
  const end = offsetAt(place.last.line, place.last.column);
  if (!place.last.comma) return { offset: end, before: `,\n${indent}`, after: "" };
  return { offset: text.indexOf(",", end) + 1, before: `\n${indent}`, after: "" };
}
