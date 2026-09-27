import { createDualProxy } from "./dual-proxy";
import {
  type Callable,
  calledAs,
  listing,
  memo,
  RUNTIME_HOOKS,
  uncallable,
  type WithFn,
} from "./proxy-members";
import type { ClientShape } from "./shape";
import type { ExecuteBackend } from "./types";

/** Build a Proxy-based typed client from an execution backend */
export function buildClientProxy(
  backend: ExecuteBackend,
  options: Record<string, unknown> = {},
  raw = false,
  shape?: ClientShape,
): unknown {
  return buildRoot(backend, options, raw, shape);
}

function buildRoot(
  backend: ExecuteBackend,
  options: Record<string, unknown>,
  raw: boolean,
  shape: ClientShape | undefined,
): object {
  const memberMemo = memo<Callable>();
  const accessorMemo = memo<object>();
  const declaredMemo = memo<object>();
  const member = (prop: string) =>
    memberMemo(prop, () => createDualProxy(backend, prop, options, raw, shape));
  const rawClient = () => accessorMemo("raw", () => buildRoot(backend, options, true, shape));
  const names = () => (shape ? [...shape.groups.keys(), ...shape.endpoints] : []);
  let withFn: WithFn<object> | undefined;

  return new Proxy<object>(Object.create(null), {
    get(_, prop) {
      if (typeof prop === "symbol") return undefined;
      if (shape?.groups.has(prop) || shape?.endpoints.has(prop)) {
        const keep = (make: () => object) => declaredMemo(prop, make);
        return declaredMember(prop, shape, raw, member, keep, rawClient);
      }
      if (RUNTIME_HOOKS.has(prop)) return undefined;
      if (prop === "raw") return rawClient();
      if (prop === "with") {
        withFn ??= (next) => buildRoot(backend, { ...options, ...next }, raw, shape);
        return withFn;
      }
      return member(prop);
    },
    ...listing(names, member),
  });
}

/**
 * A group or flat endpoint the source declares at the client's root.
 *
 * A callable `then` would make every awaited client call it: a flat endpoint
 * of that name stays out of reach, and a group of that name is handed out as
 * an object rather than a function.
 */
function declaredMember(
  prop: string,
  shape: ClientShape,
  raw: boolean,
  member: (prop: string) => Callable,
  keep: (make: () => object) => object,
  rawClient: () => object,
): unknown {
  if (prop === "then") {
    return shape.endpoints.has(prop) ? undefined : keep(() => uncallable(() => member(prop)));
  }
  if (prop !== "raw" || raw) return member(prop);
  const groupMethods = shape.groups.get(prop);
  return keep(() =>
    calledAs(member(prop), (name) => (groupMethods?.has(name) ? member(prop) : rawClient())),
  );
}
