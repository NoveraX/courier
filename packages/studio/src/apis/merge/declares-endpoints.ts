import { parseSource } from "@noverax/courier-cli/devkit";
import { findGroupDeclaration } from "../manage/group-declaration";

/** The line opening a declaration, a group's or a flat API's. */
const DECLARATION_RE = /^export\s+const\s+\w+\s*=\s*define(?:Group|Api)\(\{/m;
/** The key holding a declaration's endpoints. */
const ENDPOINTS_RE = /^\s*endpoints:\s*\{/m;

/**
 * Tell whether a file declares endpoints, a group's or an API's inline:
 * the kind of file whose endpoints are merged with the version on disk
 * rather than written whole.
 *
 * A file that parses is read by its syntax, so a description the spec wrote
 * into a comment never makes a file of schemas look like one. A file that
 * does not parse — one saved mid-edit — can only be told by how its lines
 * read, and is merged no further than being found unreadable.
 *
 * @param content - The file's content
 * @returns `true` when it declares a group or an API holding endpoints
 * @example
 * ```ts
 * declaresEndpoints('export const pets = defineGroup({\n  endpoints: {\n');  // true
 * ```
 */
export function declaresEndpoints(content: string): boolean {
  const parsed = parseSource("declaration.ts", content);
  if (parsed.problem === null) return findGroupDeclaration(parsed.program) !== null;
  return DECLARATION_RE.test(content) && ENDPOINTS_RE.test(content);
}
