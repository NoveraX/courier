import type { ExecuteBackend } from "./types";

export function shouldPassthrough(prop: string | symbol): boolean {
  if (typeof prop === "symbol") return true;
  return prop === "then" || prop === "toJSON" || prop === "valueOf" || prop === "$$typeof";
}

/**
 * Dual proxy: callable as flat endpoint, accessible as group.
 * `client.method(vars)` -> flat call; `client.group.method(vars)` -> group call.
 */
function createDualProxy(
  backend: ExecuteBackend,
  name: string,
  options: Record<string, unknown>,
  raw: boolean,
): unknown {
  const callFlat = (variables?: unknown) => backend("", name, variables, options, raw);

  return new Proxy(callFlat, {
    get(_, prop) {
      if (shouldPassthrough(prop)) return undefined;
      if (prop === "raw") return createDualProxy(backend, name, options, true);
      if (prop === "with") {
        return (newOptions: Record<string, unknown>) =>
          createDualProxy(backend, name, { ...options, ...newOptions }, raw);
      }
      /* Nested access: treat `name` as group, `prop` as method */
      return (variables?: unknown) => backend(name, prop as string, variables, options, raw);
    },
    apply(target, _, args) {
      return target(args[0]);
    },
  });
}

/** Build a Proxy-based typed client from an execution backend */
export function buildClientProxy(
  backend: ExecuteBackend,
  options: Record<string, unknown> = {},
  raw = false,
): unknown {
  return new Proxy(Object.create(null), {
    get(_, prop) {
      if (shouldPassthrough(prop)) return undefined;

      if (prop === "raw") {
        return buildClientProxy(backend, options, true);
      }
      if (prop === "with") {
        return (newOptions: Record<string, unknown>) =>
          buildClientProxy(backend, { ...options, ...newOptions }, raw);
      }

      return createDualProxy(backend, prop as string, options, raw);
    },
  });
}
