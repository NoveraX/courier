import { RESERVED_GROUP_NAMES } from "../../parser/client-names";
import { isReservedBinding, isReservedTypeName } from "../../parser/reserved-bindings";
import type { SpecPath } from "./spec-path";

/* An identifier as the parser names schemas and groups: in ASCII, which
   every module the generator writes, and every TypeScript, reads alike. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** What a name is written as: a group's binding, or a schema's type alias. */
export type NameKind = "group" | "schema";

/**
 * Refuse a name the code is written with unless it can only be a name: an
 * identifier, in Latin letters, digits, `_` and `$`; not `__proto__`, which
 * an object literal takes for its prototype; and no word JavaScript,
 * TypeScript or the generated files keep for themselves. A group's name
 * binds a value, so it may take no name a binding may not, nor one its
 * client answers to itself; a schema's names a type alias, which may take
 * no type of TypeScript's own.
 *
 * @param name - The name, as the specification gives it
 * @param at - Where it is
 * @param kind - Whether it names a group or a schema
 * @throws {InvalidSpecError} When the name is refused
 * @example
 * ```ts
 * checkName("Pet", at, "schema"); // passes
 * checkName("Pet; run()", at, "schema"); // throws
 * ```
 */
export function checkName(name: unknown, at: SpecPath, kind: NameKind): void {
  if (typeof name !== "string" || !IDENTIFIER.test(name)) {
    at.refuse(
      name,
      "a name the code is written with is an identifier, in Latin letters, digits, _ and $",
    );
  }
  if (name === "__proto__") at.refuse(name, "an object literal would take it for its prototype");
  if (kind === "group" ? isGroupNameTaken(name) : isReservedTypeName(name)) {
    at.refuse(name, "it is a word the generated code keeps for itself");
  }
}

function isGroupNameTaken(name: string): boolean {
  return isReservedBinding(name) || RESERVED_GROUP_NAMES.has(name);
}
