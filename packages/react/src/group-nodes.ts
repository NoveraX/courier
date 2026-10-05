import { type ClientShape, GROUP_PATH_SEPARATOR, RUNTIME_HOOKS } from "@noverax/courier/internal";

import type { UntypedGroupHooks } from "./untyped-group-hooks";

/**
 * Hand out each group's hooks with the groups inside it readable under
 * their names — `q.billing.invoices.useQuery("list")` — one object per
 * group, made the first time the group is read, so hooks taken from it keep
 * their identity between renders.
 *
 * Given the shape the source declares, a group lists its hooks and the
 * groups it holds, and destructures as a plain object. Without one, any name
 * that is not a hook's is read as a group inside, so a chain of any length
 * reaches the group its names spell. A hook's name is always the hook's.
 *
 * @param hooksOf - Builds the hooks of one group, by its path
 * @param shape - What the source declares, or `undefined` when only its name is known
 * @returns The node of a top-level group, by its name
 * @example
 * ```ts
 * const nodeOf = groupNodes((group) => createGroupHooks("api", group, http, sse, ws), shape);
 * nodeOf("billing").invoices.useQuery("list");
 * ```
 */
export function groupNodes(
  hooksOf: (group: string) => UntypedGroupHooks,
  shape: ClientShape | undefined,
): (name: string) => object {
  const made = new Map<string, object>();
  const nodeAt = (path: string, own: ClientShape | undefined): object => {
    let node = made.get(path);
    if (node === undefined) {
      node = shape ? knownNode(path, own) : openNode(path);
      made.set(path, node);
    }
    return node;
  };
  const inside = (path: string, name: string) => `${path}${GROUP_PATH_SEPARATOR}${name}`;

  /* The hooks, then a getter for each group the shape says is inside. */
  function knownNode(path: string, own: ClientShape | undefined): object {
    const node: Record<string, unknown> = { ...hooksOf(path) };
    for (const [name, below] of own?.groups ?? []) {
      if (Object.hasOwn(node, name)) continue;
      Object.defineProperty(node, name, {
        enumerable: true,
        get: () => nodeAt(inside(path, name), below),
      });
    }
    return node;
  }

  function openNode(path: string): object {
    const hooks = hooksOf(path);
    return new Proxy(hooks, {
      get(target, prop) {
        if (typeof prop === "symbol") return undefined;
        if (Object.hasOwn(target, prop)) return Reflect.get(target, prop);
        return RUNTIME_HOOKS.has(prop) ? undefined : nodeAt(inside(path, prop), undefined);
      },
    });
  }

  return (name) => nodeAt(name, shape?.groups.get(name));
}
