import { parseSource } from "@noverax/courier-cli/devkit";
import { findGroupDeclaration } from "../manage/group-declaration";

/**
 * Tell whether a file reads as code that declares endpoints: it parses, and
 * a top-level `defineGroup` or `defineApi` holds an `endpoints` object.
 *
 * Only such a file can be merged. The merge finds endpoints line by line, so
 * a file saved mid-edit came out with endpoints twice, an endpoint the spec
 * dropped kept and the broken line still in it.
 *
 * @param path - The file's path, whose extension picks the language
 * @param content - The file's content
 * @returns `true` when the file parses and declares endpoints
 * @example
 * ```ts
 * readsAsDeclaration("pets/index.ts", 'export const pets = defineGroup({ endpoints: { a: x.get("' ); // false
 * ```
 */
export function readsAsDeclaration(path: string, content: string): boolean {
  const parsed = parseSource(path, content);
  return parsed.problem === null && findGroupDeclaration(parsed.program) !== null;
}
