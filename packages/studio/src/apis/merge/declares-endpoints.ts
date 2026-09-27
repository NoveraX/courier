/** The line opening a declaration, a group's or a flat API's. */
const DECLARATION_RE = /^export\s+const\s+\w+\s*=\s*define(?:Group|Api)\(\{/m;
/** The key holding a declaration's endpoints. */
const ENDPOINTS_RE = /^\s*endpoints:\s*\{/m;

/**
 * Tell whether a file declares endpoints, a group's or an API's inline:
 * the kind of file whose endpoints are merged with the version on disk
 * rather than written whole.
 *
 * @param content - The file's content
 * @returns `true` when it declares a group or an API holding endpoints
 * @example
 * ```ts
 * declaresEndpoints('export const pets = defineGroup({\n  endpoints: {\n');  // true
 * ```
 */
export function declaresEndpoints(content: string): boolean {
  return DECLARATION_RE.test(content) && ENDPOINTS_RE.test(content);
}
