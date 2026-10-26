/* Every stand-in made, by the name of the variable it stands for. */
const STAND_INS = new WeakMap<object, string>();

/**
 * A stand-in for the variables a closure will receive at request time.
 *
 * Probing has no real ones, so this answers every read with another stand-in.
 * Each is callable, so a closure may walk into its variables or call methods
 * on them and still reach the call that addresses the endpoint; a call
 * answers with the stand-in it was made on. Read as text, a stand-in is the
 * placeholder of the variable it stands for, so a path written as
 * `items/${vars.id}/detail` is recorded as `items/:id/detail`; read as a
 * number it is 0. `then` is left absent so it is never taken for a promise.
 *
 * @param name - The variable it stands for; none for the variables whole
 * @param owner - What a call on it answers with
 * @returns The stand-in
 * @example
 * ```ts
 * `${(standIn() as { id: unknown }).id}`; // → ":id"
 * ```
 */
export function standIn(name = "", owner?: unknown): unknown {
  const proxy: unknown = new Proxy(() => proxy, {
    get: (_target, property) => {
      if (property === Symbol.toPrimitive) {
        return (hint: string) => (hint === "number" ? 0 : name && `:${name}`);
      }
      if (property === "then") return undefined;
      if (property === Symbol.iterator) return function* (): Generator<unknown> {};
      return typeof property === "string" ? standIn(property, proxy) : proxy;
    },
    has: () => true,
    apply: () => owner ?? proxy,
  });
  STAND_INS.set(proxy as object, name);
  return proxy;
}

/**
 * The name of the variable a stand-in stands for, or `undefined` for any
 * other value — so that a path written with `http.path` records it as the
 * parameter it is while the endpoint is probed.
 *
 * @param value - A value a closure put into its path
 * @returns The variable's name, `""` for the variables whole
 * @example
 * ```ts
 * standInName((standIn() as { id: unknown }).id); // → "id"
 * standInName("7"); // → undefined
 * ```
 */
export function standInName(value: unknown): string | undefined {
  return typeof value === "function" ? STAND_INS.get(value) : undefined;
}
