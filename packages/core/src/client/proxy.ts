import type { ClientShape } from "./shape";
import type { ExecuteBackend } from "./types";

export function shouldPassthrough(prop: string | symbol): boolean {
  if (typeof prop === "symbol") return true;
  return prop === "then" || prop === "toJSON" || prop === "valueOf" || prop === "$$typeof";
}

/** Members every function has, answered by the function rather than read as a method. */
const FUNCTION_MEMBERS: ReadonlySet<string> = new Set(["bind", "call", "apply", "toString"]);

/** Hand out one value per name, so reading a member twice gives the same thing. */
function memo<TValue>(): (name: string, make: () => TValue) => TValue {
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
function listing(names: () => readonly string[], read: (name: string) => unknown) {
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
 * Dual proxy: callable as flat endpoint, accessible as group.
 * `client.method(vars)` -> flat call; `client.group.method(vars)` -> group call.
 *
 * `bind`, `call`, `apply` and `toString` belong to the function unless the
 * source says the group has a method of that name; read as methods, they
 * started a request. Without a source, a method with one of those names is
 * reached through a client given the source or the boundary.
 */
function createDualProxy(
  backend: ExecuteBackend,
  name: string,
  options: Record<string, unknown>,
  raw: boolean,
  shape: ClientShape | undefined,
): unknown {
  const callFlat = (variables?: unknown) => backend("", name, variables, options, raw);
  const methods = shape?.groups.get(name);
  const child = memo<unknown>();
  const method = (prop: string) =>
    child(prop, () => (variables?: unknown) => backend(name, prop, variables, options, raw));

  return new Proxy<typeof callFlat>(callFlat, {
    get(target, prop) {
      if (shouldPassthrough(prop)) return undefined;
      if (prop === "raw")
        return child("raw", () => createDualProxy(backend, name, options, true, shape));
      if (prop === "with") {
        return child(
          "with",
          () => (next: Record<string, unknown>) =>
            createDualProxy(backend, name, { ...options, ...next }, raw, shape),
        );
      }
      if (FUNCTION_MEMBERS.has(prop as string) && !methods?.has(prop as string)) {
        return Reflect.get(target, prop);
      }
      return method(prop as string);
    },
    apply(target, _, args) {
      return target(args[0]);
    },
    ...listing(() => [...(methods ?? [])], method),
  });
}

/** Build a Proxy-based typed client from an execution backend */
export function buildClientProxy(
  backend: ExecuteBackend,
  options: Record<string, unknown> = {},
  raw = false,
  shape?: ClientShape,
): unknown {
  const child = memo<unknown>();
  const member = (prop: string) =>
    child(prop, () => createDualProxy(backend, prop, options, raw, shape));
  const names = () => (shape ? [...shape.groups.keys(), ...shape.endpoints] : []);

  return new Proxy(Object.create(null), {
    get(_, prop) {
      if (shouldPassthrough(prop)) return undefined;
      if (prop === "raw")
        return child("raw", () => buildClientProxy(backend, options, true, shape));
      if (prop === "with") {
        return child(
          "with",
          () => (next: Record<string, unknown>) =>
            buildClientProxy(backend, { ...options, ...next }, raw, shape),
        );
      }
      return member(prop as string);
    },
    ...listing(names, member),
  });
}
