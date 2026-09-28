import { createDualProxy } from "./dual-proxy";
import { mergeCallOptions } from "./merge-call-options";
import {
  type Callable,
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
  const names = () => (shape ? [...shape.groups.keys(), ...shape.endpoints] : []);
  let withFn: WithFn<object> | undefined;

  const read = (prop: string): unknown => {
    if (shape?.groups.has(prop) || shape?.endpoints.has(prop)) {
      return declaredMember(prop, shape, member, (make) => declaredMemo(prop, make));
    }
    if (RUNTIME_HOOKS.has(prop)) return undefined;
    if (prop === "raw") return accessorMemo("raw", () => buildRoot(backend, options, true, shape));
    if (prop === "with") {
      withFn ??= (next) => buildRoot(backend, mergeCallOptions(options, next), raw, shape);
      return withFn;
    }
    return member(prop);
  };

  return new Proxy<object>(Object.create(null), {
    get: (_, prop) => (typeof prop === "symbol" ? undefined : read(prop)),
    /* Listed members read as `get` reads them, so a spread copy of a client
       with a group named `then` is not a promise either. */
    ...listing(names, read),
  });
}

/**
 * A group or flat endpoint the source declares at the client's root.
 *
 * A callable `then` would make every awaited client call it: a flat endpoint
 * of that name stays out of reach, and a group of that name is handed out as
 * an object rather than a function. `raw` and `with` never get here: a
 * source cannot declare either.
 */
function declaredMember(
  prop: string,
  shape: ClientShape,
  member: (prop: string) => Callable,
  keep: (make: () => object) => object,
): unknown {
  if (prop !== "then") return member(prop);
  return shape.endpoints.has(prop) ? undefined : keep(() => uncallable(() => member(prop)));
}
