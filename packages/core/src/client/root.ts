import { listing, memo, RUNTIME_HOOKS, uncallable } from "./proxy-members";
import type { ClientShape } from "./shape";

/** What a client's root answers under its own names, such as `.raw` and `.with()`. */
export type RootAccessors = Readonly<Record<string, () => unknown>>;

/**
 * Build the root of a client: the object its groups and flat endpoints are
 * read from.
 *
 * A name the source declares is reached as itself, even one the runtime
 * reads as a hook — `then` for `await`, `toJSON` for `JSON.stringify`,
 * `valueOf` for coercion, `$$typeof` for React's element check. A
 * declared `then` is handed out as an object that cannot be called, so an
 * awaited client never calls it; a flat endpoint of that name stays out of
 * reach. Any other hook name is answered as absent, then the root's own
 * accessors, and every remaining name is a member. Declared names are
 * listed as the root's own, so a spread copy reads as the root does.
 *
 * @param shape - What the source declares, or `undefined` when only its name is known
 * @param member - The group or flat endpoint of a name; called again for each read
 * @param accessors - Names the root answers itself, after declared names and hooks
 * @returns The root, a proxy over those rules
 *
 * @example
 * ```ts
 * const hooks = new Map<string, object>();
 * const root = createClientRoot(shapeOfSource(api), (name) =>
 *   hooks.get(name) ?? hooks.set(name, groupHooks(name)).get(name),
 * );
 * await root; // the root itself: `then` is never a function
 * ```
 */
export function createClientRoot(
  shape: ClientShape | undefined,
  member: (name: string) => unknown,
  accessors: RootAccessors = {},
): object {
  const declaredMemo = memo<object>();
  const names = () => (shape ? [...shape.groups.keys(), ...shape.endpoints] : []);

  const read = (prop: string): unknown => {
    if (shape?.groups.has(prop) || shape?.endpoints.has(prop)) {
      return declaredMember(prop, shape, member, (make) => declaredMemo(prop, make));
    }
    if (RUNTIME_HOOKS.has(prop)) return undefined;
    const accessor = Object.hasOwn(accessors, prop) ? accessors[prop] : undefined;
    return accessor ? accessor() : member(prop);
  };

  return new Proxy<object>(
    { __proto__: null },
    {
      get: (_, prop) => (typeof prop === "symbol" ? undefined : read(prop)),
      ...listing(names, read),
    },
  );
}

/* A callable `then` would make every awaited client call it. */
function declaredMember(
  prop: string,
  shape: ClientShape,
  member: (name: string) => unknown,
  keep: (make: () => object) => object,
): unknown {
  if (prop !== "then") return member(prop);
  if (shape.endpoints.has(prop)) return undefined;
  const value = member(prop);
  return typeof value === "function" ? keep(() => uncallable(() => value)) : value;
}
