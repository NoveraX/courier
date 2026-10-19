/* The members TypeScript's `Object` declares, and so reads on every object type. */
const OBJECT_MEMBERS: ReadonlySet<string> = new Set([
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "toString",
  "valueOf",
]);

/**
 * Tell whether TypeScript reads a member of this name on every object. An
 * object type with an optional field so named, `{ constructor?: string }`,
 * takes no object that lacks the field: TypeScript reads `Object`'s member
 * on it, and the member's type is not the field's.
 *
 * @param name - A field's name
 * @returns Whether TypeScript's `Object` declares a member of that name
 * @example
 * ```ts
 * isObjectMember("toString"); // true
 * isObjectMember("__proto__"); // false
 * ```
 */
export function isObjectMember(name: string): boolean {
  return OBJECT_MEMBERS.has(name);
}
