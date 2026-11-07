/**
 * The one way the core reads the options a call is made with — an API's,
 * a group's and an endpoint's, the call's own and its caller's context —
 * and what it builds of them on the call's way: their own properties
 * alone. What a prototype answers for a key they do not have, a prototype
 * of the user's or `Object.prototype` that code elsewhere in the process
 * changed, is none of theirs.
 */

/* What every view stands on, and nothing else does: an object of nothing, with no prototype of
   its own — so a key a view does not have reads as nothing, and the view stays one an engine
   reads as fast as an object literal, as one with no prototype at all is not. */
const NONE: object = { __proto__: null };
const viewOn: (prototype: object) => object = Object.create;

/**
 * An object's own properties, in an object that stands on nothing, so that
 * what is read of it is the object's own: each enumerable property read
 * once — through its getter where it has one — and a key it does not have
 * reads as `undefined`. `undefined` and `null` have none.
 *
 * @param value - The options
 * @returns Their own properties
 * @example
 * ```ts
 * const { baseURL, headers } = ownFields(api.options);
 * ```
 */
export function ownFields<T extends object>(value: T): T;
export function ownFields<T extends object>(value: T | null | undefined): Partial<T>;
export function ownFields<T extends object>(value: T | null | undefined): Partial<T> {
  return Object.assign(viewOn(NONE), value) as Partial<T>;
}

/**
 * One own property of an object: `undefined` where it has none of its own.
 *
 * @param value - The options, or nothing
 * @param key - The option
 * @returns Its value
 * @example
 * ```ts
 * ownField(endpointOptions, "timeout"); // what the endpoint's own options say, or undefined
 * ```
 */
export function ownField<T extends object, K extends keyof T>(
  value: T | null | undefined,
  key: K,
): T[K] | undefined {
  return value != null && Object.hasOwn(value, key) ? value[key] : undefined;
}

/**
 * The options of a listener that runs once, as the platform reads them —
 * its own alone: `Object.prototype.signal`, given in the process, makes no
 * listener of the core's refuse to be added.
 */
export const ONCE = { __proto__: null, once: true } as AddEventListenerOptions;
