/* What every object inherits from `Object.prototype`, the accessors of the language's annex among them. */
const INHERITED_NAMES: ReadonlySet<string> = new Set([
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "__proto__",
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "toString",
  "valueOf",
]);

/**
 * Tell whether a name is one every object inherits. Read by that name, an
 * object that holds no such field of its own gives the inherited member —
 * a function, or for `__proto__` the object's prototype — where a field it
 * lacks should read `undefined`: a closure sent `function Object()…` as a
 * query parameter the caller left out, and every validator refused an
 * optional field so named that a value did not hold.
 *
 * @param name - A field's or a parameter's name, as the specification writes it
 * @returns Whether an object inherits a member of that name
 * @example
 * ```ts
 * isInheritedName("constructor"); // true
 * isInheritedName("id"); // false
 * ```
 */
export function isInheritedName(name: string): boolean {
  return INHERITED_NAMES.has(name);
}
