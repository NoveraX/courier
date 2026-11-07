import listed from "../../../../core/entry-exports.json" with { type: "json" };

import { isRecord } from "../../util/is-record";

/** The core's root, which code written for 0.4 takes every name from. */
export const CORE_ROOT = "@noverax/courier";

/** The core's two entries beside the root: a page's, and a server's. */
export const CORE_ENTRIES = {
  client: "@noverax/courier/client",
  server: "@noverax/courier/server",
} as const;

/**
 * The core's root and its two entries: each binds a name they share to
 * one value, `createCaller` from the page's aside, so code that looks for
 * such a name finds it from any of the three.
 */
export const CORE_MODULES: ReadonlySet<string> = new Set([
  CORE_ROOT,
  CORE_ENTRIES.client,
  CORE_ENTRIES.server,
]);

/** Which of the core's entries: the page's, or the server's. */
export type EntrySide = keyof typeof CORE_ENTRIES;

/** What an entry exports, as the core's list writes it. */
export interface EntryExports {
  readonly values: ReadonlySet<string>;
  readonly types: ReadonlySet<string>;
  /** The values it binds to another value than the root does: an import of one, moved to it, takes another function. */
  readonly otherThanRoot: ReadonlySet<string>;
  /** The values it leaves to the root, which its side takes from there: `redact`, which the page's entry leaves out. */
  readonly rootOnly: ReadonlySet<string>;
}

function isStrings(list: unknown): list is string[] {
  return Array.isArray(list) && list.every((each) => typeof each === "string");
}

/* An entry of the list, held to its shape: the list is the core's, and a list of another shape is a bug of the build, not of a project. */
function exportsOf(entry: unknown, name: string): EntryExports {
  const { values, types, otherThanRoot = {}, rootOnly = {} } = isRecord(entry) ? entry : {};
  if (!isStrings(values) || !isStrings(types) || !isRecord(otherThanRoot) || !isRecord(rootOnly))
    throw new TypeError(
      `The core's entry-exports.json gives ${name} in a shape the upgrade does not read`,
    );
  return {
    values: new Set(values),
    types: new Set(types),
    otherThanRoot: new Set(Object.keys(otherThanRoot)),
    rootOnly: new Set(Object.keys(rootOnly)),
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

/**
 * Whether an entry leaves a name to the root, which its side takes from
 * there: the page's entry leaves `redact` out, so a page takes it from
 * the root, and the server from either.
 *
 * @param side - The entry
 * @param name - The name
 * @returns Whether its side takes the name from the root
 * @example
 * ```ts
 * leftToRoot("client", "redact"); // true
 * ```
 */
export function leftToRoot(side: EntrySide, name: string): boolean {
  return ENTRY_EXPORTS[side].rootOnly.has(name);
}

/**
 * Whether the root gives a name as a type alone: an entry gives it among
 * its types, and neither among its values.
 *
 * @param name - The name
 * @returns Whether an import of it takes a type, written with `type` or not
 * @example
 * ```ts
 * isTypeOnly("CallOptions"); // true
 * ```
 */
export function isTypeOnly(name: string): boolean {
  return (
    !VALUES.has(name) &&
    (ENTRY_EXPORTS.client.types.has(name) || ENTRY_EXPORTS.server.types.has(name))
  );
}
