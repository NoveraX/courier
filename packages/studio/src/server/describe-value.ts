import { isRecord } from "./mocks-edit/is-record";

/* "U" is left out: the names that start with it, Uint8Array and URL among
   them, take "a". */
const TAKES_AN = /^[AEIO]/;

/**
 * Name what a config value is, for a message that says why it is refused:
 * its type for a primitive, its kind for a built-in object, its class for an
 * instance.
 *
 * @param value - The value found
 * @returns Words that fit "… is ___, not …"
 * @example
 * ```ts
 * describeValue(new Map()); // → "a Map"
 * describeValue([1]); // → "an array"
 * ```
 */
export function describeValue(value: unknown): string {
  if (value === undefined || value === null) return String(value);
  if (Array.isArray(value)) return "an array";
  if (!isRecord(value)) return `a ${typeof value}`;
  const tag = Object.prototype.toString.call(value).slice("[object ".length, -1);
  if (tag !== "Object") return `${TAKES_AN.test(tag) ? "an" : "a"} ${tag}`;
  const name = constructorName(Object.getPrototypeOf(value));
  return name === null ? "an object with a prototype of its own" : `an instance of ${name}`;
}

/* Only a constructor the prototype holds itself names the object: one it
   inherits would call `Object.create({})` an instance of Object. */
function constructorName(proto: unknown): string | null {
  if (!isRecord(proto) || !Object.hasOwn(proto, "constructor")) return null;
  const ctor = proto.constructor;
  return typeof ctor === "function" && ctor.name !== "" ? ctor.name : null;
}
