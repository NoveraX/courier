/** The text a tool leaves as it formats a file at a path. */
export type FileFormatter = (path: string, text: string) => Promise<string>;

/**
 * A module's namespace as an object to read from: what `import` gave, or
 * nothing to read where it gave something else.
 *
 * @param value - What `import` gave
 * @returns The object
 */
export function moduleObject(value: unknown): object {
  return typeof value === "object" && value !== null ? value : {};
}

/**
 * The tool's API in a module: the namespace itself, or its default export,
 * which is where a CommonJS module's exports land when `import` loads it.
 *
 * @param loaded - What `import` gave
 * @param is - Whether a value is the API
 * @returns The API, or `null` when the module holds none
 */
export function toolApi<TApi>(loaded: unknown, is: (value: unknown) => value is TApi): TApi | null {
  if (is(loaded)) return loaded;
  const fallback: unknown = Reflect.get(moduleObject(loaded), "default");
  return is(fallback) ? fallback : null;
}
