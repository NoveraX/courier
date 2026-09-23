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
