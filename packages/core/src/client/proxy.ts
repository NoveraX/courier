import { createDualProxy } from "./dual-proxy";
import { mergeCallOptions } from "./merge-call-options";
import { type Callable, memo, type WithFn } from "./proxy-members";
import { createClientRoot } from "./root";
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

/* `raw` and `with` are answered by the root itself: a source cannot declare
   a group or an endpoint of either name. */
function buildRoot(
  backend: ExecuteBackend,
  options: Record<string, unknown>,
  raw: boolean,
  shape: ClientShape | undefined,
): object {
  const memberMemo = memo<Callable>();
  const accessorMemo = memo<object>();
  let withFn: WithFn<object> | undefined;

  return createClientRoot(
    shape,
    (name) => memberMemo(name, () => createDualProxy(backend, name, options, raw, shape)),
    {
      raw: () => accessorMemo("raw", () => buildRoot(backend, options, true, shape)),
      with: () => {
        withFn ??= (next) => buildRoot(backend, mergeCallOptions(options, next), raw, shape);
        return withFn;
      },
    },
  );
}
