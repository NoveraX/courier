import listed from "../../../../core/entry-exports.json" with { type: "json" };

import { isRecord } from "../../util/is-record";

/** The core's root, which code written for 0.4 takes every name from. */
export const CORE_ROOT = "@noverax/courier";

/** The core's two entries beside the root: a page's, and a server's. */
export const CORE_ENTRIES = {
  client: "@noverax/courier/client",
  server: "@noverax/courier/server",
} as const;

/** Which of the core's entries: the page's, or the server's. */
export type EntrySide = keyof typeof CORE_ENTRIES;

/** What an entry exports, as the core's list writes it. */
export interface EntryExports {
  readonly values: ReadonlySet<string>;
  readonly types: ReadonlySet<string>;
  /** The values it binds to another value than the root does: an import of one, moved to it, takes another function. */
  readonly otherThanRoot: ReadonlySet<string>;
}

function isStrings(list: unknown): list is string[] {
  return Array.isArray(list) && list.every((each) => typeof each === "string");
}

/* An entry of the list, held to its shape: the list is the core's, and a list of another shape is a bug of the build, not of a project. */
function exportsOf(entry: unknown, name: string): EntryExports {
  const { values, types, otherThanRoot = {} } = isRecord(entry) ? entry : {};
  if (!isStrings(values) || !isStrings(types) || !isRecord(otherThanRoot))
    throw new TypeError(
      `The core's entry-exports.json gives ${name} in a shape the upgrade does not read`,
    );
  return {
    values: new Set(values),
    types: new Set(types),
    otherThanRoot: new Set(Object.keys(otherThanRoot)),
  };
}

/**
 * What each of the core's entries exports, read from the core's own list
 * as the CLI is built: the list is not published, so it goes into the
 * CLI, which carries the names of the core it was built with.
 */
export const ENTRY_EXPORTS: Readonly<Record<EntrySide, EntryExports>> = {
  client: exportsOf(listed["./client"], "./client"),
  server: exportsOf(listed["./server"], "./server"),
};

const VALUES = new Set([...ENTRY_EXPORTS.client.values, ...ENTRY_EXPORTS.server.values]);

/**
 * Whether an entry takes a name the root gives: a value among its values,
 * a type among its types — a value imported as a type needs the value
 * there too. A name neither entry exports, which the root of 0.5 has not,
 * is taken by none.
 *
 * @param side - The entry
 * @param name - The name, as the root exports it
 * @returns Whether an import of it may come from the entry
 * @example
 * ```ts
 * entryTakes("client", "registerSources"); // false: it is the server's
 * ```
 */
export function entryTakes(side: EntrySide, name: string): boolean {
  const entry = ENTRY_EXPORTS[side];
  return VALUES.has(name) ? entry.values.has(name) : entry.types.has(name);
}

/**
 * Whether an entry binds a name to another value than the root does:
 * `createCaller` from the page's entry is a page's caller, where the
 * root's is the server's.
 *
 * @param side - The entry
 * @param name - The name
 * @returns Whether moving an import of it to the entry would take another function
 * @example
 * ```ts
 * bindsOtherwise("client", "createCaller"); // true
 * ```
 */
export function bindsOtherwise(side: EntrySide, name: string): boolean {
  return ENTRY_EXPORTS[side].otherThanRoot.has(name);
}
