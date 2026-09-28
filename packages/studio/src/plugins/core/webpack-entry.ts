/** A webpack entry as a config may hold it: a path, a list, or a description. */
export type WebpackEntryValue =
  | string
  | string[]
  | { import?: string | string[]; [key: string]: unknown };

/**
 * Put a module first in a webpack entry, whichever form the entry takes, and
 * return the entry in the same form.
 *
 * A config handed to webpack's `entry` function holds its entries unnormalized:
 * Next.js 16 gives `main-app` as a list and `main` as a single path. Reading
 * only the `{ import }` form, the Next.js integration found nothing to add to
 * and connected nothing.
 *
 * @param entry - The entry to extend.
 * @param module - The module to load before the rest of it.
 * @returns The entry with the module first; unchanged when it is already there.
 */
export function prependToEntry(entry: WebpackEntryValue, module: string): WebpackEntryValue {
  if (typeof entry === "string") return entry === module ? entry : [module, entry];
  if (Array.isArray(entry)) return entry.includes(module) ? entry : [module, ...entry];
  if (entry.import === undefined) return entry;
  return { ...entry, import: prependToEntry(entry.import, module) as string | string[] };
}

/**
 * Whether a webpack `entry` option, once resolved, is the record of named
 * entries every other form is normalized to.
 *
 * @param value - The option, resolved when it is a function
 * @returns Whether it maps names to entries
 * @example
 * ```ts
 * isEntryRecord({ main: "./src/index.js" }); // true
 * isEntryRecord("./src/index.js"); // false
 * ```
 */
export function isEntryRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether one entry has a form `prependToEntry` extends: a path, a list of
 * paths, or a description whose `import` is one of those.
 *
 * @param value - The entry
 * @returns Whether it is a webpack entry
 * @example
 * ```ts
 * isEntryValue({ import: ["./src/index.js"], dependOn: "shared" }); // true
 * isEntryValue(42); // false
 * ```
 */
export function isEntryValue(value: unknown): value is WebpackEntryValue {
  if (isModuleList(value)) return true;
  if (!isEntryRecord(value)) return false;
  return value.import === undefined || isModuleList(value.import);
}

function isModuleList(value: unknown): value is string | string[] {
  return (
    typeof value === "string" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}
