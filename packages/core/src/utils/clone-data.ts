/** Each object copied so far, by the original: data that refers to itself is copied so. */
type Copies = Map<object, unknown>;

/**
 * A deep copy of an answer's data: `structuredClone` where the runtime has
 * it, and where it has not — React Native without Expo — a copy of its
 * arrays, plain objects, dates, maps and sets, any other value kept as it is.
 *
 * @param data - What to copy
 * @returns The copy
 * @throws {DOMException} `DataCloneError`, from `structuredClone`, for a value it cannot copy
 * @example
 * ```ts
 * const copy = cloneData({ users: [{ id: 1 }] });
 * ```
 */
export function cloneData<TData>(data: TData): TData {
  if (typeof structuredClone === "function") return structuredClone(data);
  return copyOf(data, new Map()) as TData;
}

function copyOf(value: unknown, copies: Copies): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (copies.has(value)) return copies.get(value);
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return copyArray(value, copies);
  if (value instanceof Map) return copyMap(value, copies);
  if (value instanceof Set) return copySet(value, copies);
  return isPlainObject(value) ? copyObject(value, copies) : value;
}

function copyArray(source: readonly unknown[], copies: Copies): unknown[] {
  const copy: unknown[] = [];
  copies.set(source, copy);
  for (const item of source) copy.push(copyOf(item, copies));
  return copy;
}

function copyMap(source: ReadonlyMap<unknown, unknown>, copies: Copies): Map<unknown, unknown> {
  const copy = new Map<unknown, unknown>();
  copies.set(source, copy);
  for (const [key, item] of source) copy.set(copyOf(key, copies), copyOf(item, copies));
  return copy;
}

function copySet(source: ReadonlySet<unknown>, copies: Copies): Set<unknown> {
  const copy = new Set<unknown>();
  copies.set(source, copy);
  for (const item of source) copy.add(copyOf(item, copies));
  return copy;
}

/* Defined, not assigned: a `__proto__` field stays a field, as JSON.parse made it. */
function copyObject(source: Record<string, unknown>, copies: Copies): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  copies.set(source, copy);
  for (const [key, item] of Object.entries(source)) {
    const value = copyOf(item, copies);
    Object.defineProperty(copy, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
