import type { TextEdit } from "../migration";
import type { AstNode } from "./ast";
import { occurrencesOf } from "./identifier-roles";

/**
 * Whether a name can be renamed everywhere in a file for certain: the
 * file binds it once — its import — so every reference is to that
 * binding, and nothing in the file is written with the new name, so none
 * is captured by it.
 *
 * @param program - The file's tree
 * @param name - The name as the file writes it
 * @param to - The new name
 * @returns Whether renaming each reference keeps the file meaning what it meant
 * @example
 * ```ts
 * canRename(program, "TimeoutError", "RealtimeTimeoutError"); // false where a function of the file declares its own TimeoutError
 * ```
 */
export function canRename(program: AstNode, name: string, to: string): boolean {
  const bindings = occurrencesOf(program, name).filter((each) => each.role === "binding");
  return bindings.length === 1 && occurrencesOf(program, to).length === 0;
}

/**
 * The edits that rename each reference to a name, the binding left to
 * its declaration: a property written short, `{ name }`, keeps its key,
 * and an export written short keeps the name it exports.
 *
 * @param program - The file's tree
 * @param name - The name
 * @param to - The new name
 * @returns The edits
 * @example
 * ```ts
 * renameEdits(program, "TimeoutError", "RealtimeTimeoutError");
 * ```
 */
export function renameEdits(program: AstNode, name: string, to: string): TextEdit[] {
  return occurrencesOf(program, name)
    .filter((each) => each.role === "reference")
    .map((each) => ({
      start: each.node.start,
      end: each.node.end,
      text:
        each.shorthand === "property"
          ? `${name}: ${to}`
          : each.shorthand === "export"
            ? `${to} as ${name}`
            : to,
    }));
}
