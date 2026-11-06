import { GROUP_PATH_SEPARATOR } from "../define/group-tree";
import { isCallFailure } from "../errors/call-failure";
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

/** Where a member of a client sits: the path of the group that holds it, and its name. */
interface Place {
  /** The holding group's path, `billing`; `""` at the root */
  group: string;
  name: string;
}

/**
 * Dual proxy: callable as an endpoint, readable as a group.
 * `client.method(vars)` -> flat call; `client.group.method(vars)` -> group
 * call; `client.billing.invoices.list(vars)` -> a call in `billing.invoices`,
 * at any depth.
 *
 * A method the source declares is reached by its name even when the name is
 * also a runtime hook. `bind`, `call`, `apply` and `toString` otherwise
 * belong to the function; read as methods, they started a request. Without
 * a source, a method with one of those names is reached through a client
 * given the source or its routes, and so is one named `safe`, which an
 * endpoint answers with its call that does not throw. `raw` and `with` are
 * always the accessors: a source cannot declare a method or a group of
 * either name.
 *
 * Without a shape every member is read as both, so a chain of any length
 * reaches the group its names spell.
 */
export function createDualProxy(
  backend: ExecuteBackend,
  name: string,
  options: Record<string, unknown>,
  raw: boolean,
  shape: ClientShape | undefined,
): Callable {
  return groupNode(backend, { group: "", name }, options, raw, shape?.groups.get(name), !shape);
}

function groupNode(
  backend: ExecuteBackend,
  place: Place,
  options: Record<string, unknown>,
  raw: boolean,
  own: ClientShape | undefined,
  unknown: boolean,
): Callable {
  const path = place.group ? `${place.group}${GROUP_PATH_SEPARATOR}${place.name}` : place.name;
  const callFlat: Callable = (variables) =>
    backend(place.group, place.name, variables, options, raw);
  const methodMemo = memo<Callable>();
  const groupMemo = memo<Callable>();
  const accessorMemo = memo<Callable>();
  const method = (prop: string) =>
    methodMemo(prop, () =>
      withSafe((variables?: unknown) => backend(path, prop, variables, options, raw)),
    );
  const group = (prop: string) =>
    groupMemo(prop, () =>
      groupNode(backend, { group: path, name: prop }, options, raw, own?.groups.get(prop), unknown),
    );
  /* A name the shape does not declare: a method where the shape is known,
     and either where it is not, so the chain may go on. */
  const member = (prop: string) => (own?.groups.has(prop) || unknown ? group(prop) : method(prop));
  let withFn: WithFn<Callable> | undefined;

  return new Proxy<Callable>(callFlat, {
    get(target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (own?.groups.has(prop)) return group(prop);
      if (own?.endpoints.has(prop)) return method(prop);
      if (RUNTIME_HOOKS.has(prop)) return undefined;
      if (prop === "raw") {
        return accessorMemo("raw", () => groupNode(backend, place, options, true, own, unknown));
      }
      if (prop === "with") {
        withFn ??= (next) =>
          groupNode(backend, place, mergeCallOptions(options, next), raw, own, unknown);
        return withFn;
      }
      if (prop === "safe") return accessorMemo("safe", () => safeCall(callFlat));
      if (FUNCTION_MEMBERS.has(prop)) return Reflect.get(target, prop);
      return member(prop);
    },
    apply(target, _: unknown, args) {
      return target(args[0]);
    },
    ...listing(() => (own ? [...own.groups.keys(), ...own.endpoints] : []), member),
  });
}

/* A method, with the call of it that does not throw what its caller expects. */
function withSafe(call: Callable): Callable {
  return Object.assign(call, { safe: safeCall(call) });
}

/* A call that settles with its data or its failure: what is no failure — a cancellation, a mistake
   in the program — rejects, as the call does. One that throws before it is sent rejects too. */
function safeCall(call: Callable): Callable {
  return async (variables?: unknown) => {
    try {
      return { data: await call(variables), error: null };
    } catch (error) {
      if (isCallFailure(error)) return { data: null, error };
      throw error;
    }
  };
}
