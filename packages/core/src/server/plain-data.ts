/**
 * Whether a value is an object of plain data, as a server's options are:
 * one an object literal makes, or one with no prototype — a `Proxy` over
 * either among them. An instance of a class, or a `Map`, holds what no
 * check of its fields reads, and what no copy of them holds.
 *
 * @param value - The value
 * @returns Whether it is such an object
 * @example
 * ```ts
 * isPlainObject({ headers: ["x-tenant"] }); // true
 * isPlainObject(new Map()); // false
 * ```
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/* What a copy holds in place of a value that is no data: what the value was, for the check that
   refuses it to name. */
class NotData {
  constructor(readonly what: string) {
    Object.freeze(this);
  }
}

/**
 * A copy of options that are data, read once: each property of an object
 * of plain data and each item of a list is read one time, into an object
 * or a list of the copy's own, frozen. The copy is the data its user wrote
 * — an object literal's object, a list — so the code that reads options
 * back reads it as it read them; a server reads their own fields alone,
 * as it reads every option. A key a JSON document gave the options, even
 * `__proto__`, is a field of the copy, never its prototype. A value that is
 * no data — an instance of a class, a `Map`, a `Set`, a function — is not
 * copied: the copy holds what it was, which a check names as it refuses
 * it. A check that reads the copy alone passes what is then held, however
 * the options answer another read: a getter, or a `Proxy`, that changes
 * its answer is read once.
 *
 * @param value - The options, as given
 * @returns The copy
 * @example
 * ```ts
 * dataCopy({ headers: ["x-tenant"] }); // { headers: ["x-tenant"] }, frozen
 * ```
 */
export function dataCopy(value: unknown): unknown {
  return copied(value, []);
}

function copied(value: unknown, within: readonly object[]): unknown {
  if (typeof value === "function") return new NotData(describe(value));
  if (typeof value !== "object" || value === null) return value;
  if (within.includes(value)) return new NotData("an object that holds itself");
  const inside = [...within, value];
  if (Array.isArray(value)) {
    const { length } = value;
    const items: unknown[] = [];
    for (let index = 0; index < length; index++) items.push(copied(value[index], inside));
    return Object.freeze(items);
  }
  if (!isPlainObject(value)) return new NotData(describe(value));
  const fields = Object.keys(value).map((key) => [key, copied(value[key], inside)]);
  return Object.freeze(Object.fromEntries(fields));
}

/**
 * What a server reads of a copy it holds: the same data, each object of it
 * of no prototype and frozen, so that a field the copy does not have reads
 * as nothing — whatever `Object.prototype` is given in the process — in
 * every place that reads it. The copy itself is its user's to read, an
 * object as they wrote it; the view is the server's alone.
 *
 * @param copy - A copy {@link dataCopy} made
 * @returns The view of it
 * @example
 * ```ts
 * dataView(dataCopy({ cookies: ["sid"] })); // { cookies: ["sid"] }, of no prototype, frozen
 * ```
 */
export function dataView(copy: unknown): unknown {
  if (Array.isArray(copy)) return Object.freeze(copy.map(dataView));
  if (!isPlainObject(copy)) return copy;
  /* With no prototype, a key `__proto__` is a field like any other. */
  const fields: Record<string, unknown> = { __proto__: null };
  for (const [key, value] of Object.entries(copy)) fields[key] = dataView(value);
  return Object.freeze(fields);
}

/**
 * What a caller actually passed, for an error message that names it — or,
 * for what a {@link dataCopy} holds in place of a value that is no data,
 * what that value was.
 *
 * @param value - The value
 * @returns What it is, as `an instance of Map` or `a string`
 * @example
 * ```ts
 * describe(new Map()); // "an instance of Map"
 * describe("x-api-version"); // "a string"
 * ```
 */
export function describe(value: unknown): string {
  if (value instanceof NotData) return value.what;
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return "an array";
  if (value instanceof Promise) return "a Promise — await it first";
  if (typeof value !== "object") return `a ${typeof value}`;
  const name: unknown = value.constructor?.name;
  return typeof name === "string" && name !== "" ? `an instance of ${name}` : "an object";
}
