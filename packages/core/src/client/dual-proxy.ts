import { mergeCallOptions } from "./merge-call-options";
import {
  type Callable,
  FUNCTION_MEMBERS,
  listing,
  memo,
  RUNTIME_HOOKS,
  type WithFn,
} from "./proxy-members";
import type { ClientShape } from "./shape";
import type { ExecuteBackend } from "./types";

/**
 * Dual proxy: callable as flat endpoint, accessible as group.
 * `client.method(vars)` -> flat call; `client.group.method(vars)` -> group call.
 *
 * A method the source declares is reached by its name even when the name is
 * also a runtime hook. `bind`, `call`, `apply` and `toString` otherwise
 * belong to the function; read as methods, they started a request. Without
 * a source, a method with one of those names is reached through a client
 * given the source or the boundary. `raw` and `with` are always the
 * accessors: a source cannot declare a method of either name.
 */
export function createDualProxy(
  backend: ExecuteBackend,
  name: string,
  options: Record<string, unknown>,
  raw: boolean,
  shape: ClientShape | undefined,
): Callable {
  const callFlat: Callable = (variables) => backend("", name, variables, options, raw);
  const methods = shape?.groups.get(name);
  const methodMemo = memo<Callable>();
  const accessorMemo = memo<Callable>();
  const method = (prop: string) =>
    methodMemo(prop, () => (variables?: unknown) => backend(name, prop, variables, options, raw));
  let withFn: WithFn<Callable> | undefined;

  return new Proxy<Callable>(callFlat, {
    get(target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (methods?.has(prop)) return method(prop);
      if (RUNTIME_HOOKS.has(prop)) return undefined;
      if (prop === "raw") {
        return accessorMemo("raw", () => createDualProxy(backend, name, options, true, shape));
      }
      if (prop === "with") {
        withFn ??= (next) =>
          createDualProxy(backend, name, mergeCallOptions(options, next), raw, shape);
        return withFn;
      }
      if (FUNCTION_MEMBERS.has(prop)) return Reflect.get(target, prop);
      return method(prop);
    },
    apply(target, _, args) {
      return target(args[0]);
    },
    ...listing(() => [...(methods ?? [])], method),
  });
}
