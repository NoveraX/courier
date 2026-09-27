/**
 * The pieces the client's proxies are built from.
 */

export type Callable = (variables?: unknown) => unknown;
export type WithFn<TClient> = (next: Record<string, unknown>) => TClient;

/**
 * Names the runtime reads as hooks — `await`, `JSON.stringify`, coercion,
 * React's element check. They are answered as absent unless the source
 * declares a member of that name.
 */
export const RUNTIME_HOOKS: ReadonlySet<string> = new Set([
  "then",
  "toJSON",
  "valueOf",
  "$$typeof",
]);

/** Members every function has, answered by the function rather than read as a method. */
export const FUNCTION_MEMBERS: ReadonlySet<string> = new Set(["bind", "call", "apply", "toString"]);

/** Hand out one value per name, so reading a member twice gives the same thing. */
export function memo<TValue>(): (name: string, make: () => TValue) => TValue {
  const made = new Map<string, TValue>();
  return (name, make) => {
    let value = made.get(name);
    if (value === undefined) {
      value = make();
      made.set(name, value);
    }
    return value;
  };
}

/** Report the names a shape lists as the proxy's own, for `Object.keys`, `in` and spread. */
export function listing(names: () => readonly string[], read: (name: string) => unknown) {
  return {
    ownKeys: (target: object) => [
      ...new Set([...names(), ...Reflect.ownKeys(target).filter((k) => typeof k !== "string")]),
    ],
    has: (target: object, prop: string | symbol) =>
      (typeof prop === "string" && names().includes(prop)) || Reflect.has(target, prop),
    getOwnPropertyDescriptor: (target: object, prop: string | symbol) =>
      typeof prop === "string" && names().includes(prop)
        ? { configurable: true, enumerable: true, value: read(prop) }
        : Reflect.getOwnPropertyDescriptor(target, prop),
  };
}

/**
 * A member called as one thing and read as another: an endpoint or group
 * named `raw` is called as itself, while the names read from it still reach
 * the `.raw` accessor the types promise there too.
 */
export function calledAs(called: Callable, readFrom: (prop: string) => object): Callable {
  return new Proxy<Callable>(called, {
    get: (_, prop) => (typeof prop === "symbol" ? undefined : Reflect.get(readFrom(prop), prop)),
  });
}

/** Read like `target`, but not callable — so never taken for a promise. */
export function uncallable(target: () => object): object {
  return new Proxy<object>(Object.create(null), {
    get: (_, prop) => (typeof prop === "symbol" ? undefined : Reflect.get(target(), prop)),
  });
}
