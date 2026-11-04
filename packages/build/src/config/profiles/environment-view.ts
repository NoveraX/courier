/**
 * The environment as a framework's env module shows it, read from
 * `process.env` as code reads it: a module that names one variable depends
 * on that one alone — which a reading of the routes notes, so a change to
 * any other variable does not read them again — and a variable a loader set
 * before the config ran, from the project's env files, is the one seen.
 */

/* Names an importer reads off a module for its own sake, never as variables: interop and thenables. */
const NOT_VARIABLES = new Set(["default", "__esModule", "then"]);

/**
 * A read-only view of the variables `shows` lets through, with `members`
 * beside them — Astro's `getSecret`, say.
 *
 * @param shows - Whether the view shows a variable, by its name
 * @param members - What the view holds besides the variables, by name
 * @returns The view, an object whose properties are the variables it shows
 * @example
 * ```ts
 * const publicEnv = environmentView((name) => name.startsWith("PUBLIC_"));
 * publicEnv.PUBLIC_API_URL; // process.env.PUBLIC_API_URL
 * publicEnv.DATABASE_URL; // undefined
 * ```
 */
export function environmentView(
  shows: (name: string) => boolean,
  members: Readonly<Record<string, unknown>> = {},
): object {
  const isMember = (key: string | symbol): key is string =>
    typeof key === "string" && Object.hasOwn(members, key);
  const isShown = (key: string | symbol): key is string =>
    typeof key === "string" && !NOT_VARIABLES.has(key) && !isMember(key) && shows(key);
  /* A variable's value is a string; anything else `process.env` answers is its prototype's. */
  const variable = (name: string): string | undefined => {
    const value: unknown = process.env[name];
    return typeof value === "string" ? value : undefined;
  };
  const descriptor = (value: unknown): PropertyDescriptor => ({
    value,
    enumerable: true,
    configurable: true,
    writable: false,
  });
  return new Proxy<object>(
    {},
    {
      get: (_, key) => (isMember(key) ? members[key] : isShown(key) ? variable(key) : undefined),
      has: (_, key) => isMember(key) || (isShown(key) && variable(key) !== undefined),
      ownKeys: () => [...Object.keys(members), ...Object.keys(process.env).filter(isShown)],
      getOwnPropertyDescriptor: (_, key) => {
        if (isMember(key)) return descriptor(members[key]);
        const value = isShown(key) ? variable(key) : undefined;
        return value === undefined ? undefined : descriptor(value);
      },
      set: () => false,
      defineProperty: () => false,
      deleteProperty: () => false,
    },
  );
}
