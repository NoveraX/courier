import {
  bindsOtherwise,
  CORE_ENTRIES,
  CORE_ROOT,
  entryTakes,
  leftToRoot,
} from "../entries/entry-names";
import type { StartNote } from "../entries/start-imports";
import { importLine, listed, type TakenName } from "./entry-findings";

/** A name a declaration takes, and whether each side's build keeps it, as TanStack Start builds the module. */
export interface KeptName extends TakenName {
  readonly page: boolean;
  readonly server: boolean;
  /** Whether the page's build keeps it only as Courier reads the module: a function another module gives, which Start's compiler follows and Courier does not, may be Start's and take it out. */
  readonly maybe?: boolean | undefined;
}

/** A function a module takes from another module, which Courier does not follow: the name it takes it under, and the module. */
export type Unfollowed = readonly [name: string, from: string];

/* What TanStack Start's build takes out of a page, and where a name it keeps to the server goes. */
const START_DROPS =
  "a server function's handler and validator, a route's server, ssr and headers, and what createServerOnlyFn, createIsomorphicFn().server() and createMiddleware().server() are given";
const START_SERVER = "where only code Start takes out of a page uses it";
/* Why an import stays where a page's build keeps a name the root gives with the server's part. */
const BRINGS = `the import stays in ${CORE_ROOT}, and the page's bundle takes the server's part with it`;

/* What the page's build keeps of an import whose other names only code Start takes out of a page uses, and why the import stays: a name the page's entry leaves out, which a page takes from the root, or else the server's part the root brings. */
function pageKeeps(client: readonly KeptName[], root: readonly KeptName[]): string {
  const named = (each: readonly KeptName[]) => listed(each.map(({ name }) => name));
  if (root.length === 0) return `${named(client)}: ${BRINGS}`;
  const it = root.length === 1 ? "it" : "them";
  return `${client.length > 0 ? `${named(client)}, and ` : ""}${named(root)}, which ${CORE_ENTRIES.client} leaves out, so a page takes ${it} from ${CORE_ROOT}: the import stays there`;
}

/* Why an import whose names only a function Courier did not follow may take out of a page stays in the root, and what to do. */
function unfollowedWhy(names: readonly KeptName[], through: readonly Unfollowed[]): string {
  const sources = [...new Set(through.map(([, from]) => from))];
  const one = through.length === 1;
  const which =
    through.length === 0
      ? "a function this file takes from another module"
      : `${listed(through.map(([name]) => name))}, which this file takes from ${sources.length === 1 ? sources[0] : "other modules"},`;
  const them = names.length === 1 ? "it" : "them";
  return `Courier could not follow ${which} to ${one ? "a function" : "functions"} of TanStack Start's, whose build may take the code ${one ? "it is" : "they are"} given out of a page, so the import stays in ${CORE_ROOT}: if only that code uses ${listed(names.map(({ name }) => name))}, take ${them} from ${CORE_ENTRIES.server}, and otherwise give the page its own module`;
}

/**
 * What a module TanStack Start builds is told where a declaration stays
 * in the root: the server's names its build of a page keeps — one the
 * page's entry has not, other than one it leaves to the root, as
 * `redact`, or binds otherwise where the server's build keeps it too —
 * or else the names it keeps to the server beside those the page takes,
 * with why the import stays: the server's part it brings the page, or a
 * name the page takes from the root alone; and the entry for each.
 * Where the page's build keeps a server's name only as Courier reads
 * the module, through a function of another module's it did not
 * follow, the step says so, and claims no name the page keeps. None
 * where it keeps no server's name to either.
 *
 * @param names - The names, with what each side's build keeps of them
 * @param through - The functions of other modules Courier did not follow, which may take them out of a page
 * @returns The step, or none
 * @example
 * ```ts
 * startFinding([{ name: "createHandler", type: false, page: false, server: true }, { name: "isHTTPError", type: false, page: true, server: true }], [])?.instead.length; // 2
 * ```
 */
export function startFinding(names: readonly KeptName[], through: readonly Unfollowed[]) {
  const values = names.filter(({ type }) => !type);
  const leaky = ({ name, page, server }: KeptName) =>
    page &&
    !leftToRoot("client", name) &&
    (!entryTakes("client", name) || (server && bindsOtherwise("client", name)));
  const leaks = values.filter((each) => leaky(each) && each.maybe !== true);
  const maybe = values.filter((each) => leaky(each) && each.maybe === true);
  const server = values.filter((each) => each.server && !each.page);
  if (leaks.length === 0 && maybe.length === 0 && server.length === 0) return undefined;
  const root = values.filter((each) => each.page && leftToRoot("client", each.name));
  const client = values.filter((each) => each.page && !leaky(each) && !root.includes(each));
  const types = names.filter(({ type }) => type);
  const toClient = [...client, ...types.filter(({ name }) => entryTakes("client", name))];
  const toServer = [
    ...server,
    ...leaks,
    ...maybe,
    ...types.filter(({ name }) => !entryTakes("client", name)),
  ];
  const plain = [
    ...(toClient.length > 0 ? [importLine(toClient, "client")] : []),
    ...(root.length > 0 ? [importLine(root, "root", "a page takes it from the root")] : []),
  ];
  const pageOwn = maybe.filter(({ name }) => entryTakes("client", name));
  if (leaks.length === 0 && maybe.length > 0)
    return {
      what: unfollowedWhy(maybe, through),
      instead: [
        ...plain,
        importLine(toServer, "server", START_SERVER),
        ...(pageOwn.length > 0 ? [importLine(pageOwn, "client", "in the page's module")] : []),
      ],
    };
  const caller = leaks.every(({ name }) => bindsOtherwise("client", name)) ? " caller" : "";
  const what =
    leaks.length > 0
      ? `TanStack Start takes out of a page the code only the server runs — ${START_DROPS} — but the page's build keeps ${listed(leaks.map(({ name }) => name))}, the server's${caller} as ${CORE_ROOT} gives ${leaks.length === 1 ? "it" : "them"}: ${BRINGS}`
      : `TanStack Start takes out of a page the code that uses ${listed(server.map(({ name }) => name))}, but the page's build keeps ${pageKeeps(client, root)}`;
  const shared = [...leaks, ...maybe].filter(({ name }) => entryTakes("client", name));
  return {
    what,
    instead: [
      ...plain,
      ...(shared.length > 0
        ? [importLine(shared, "client", "where only the page's code uses it")]
        : []),
      importLine(toServer, "server", START_SERVER),
    ],
  };
}

/**
 * What a module is told that a page may load only through an import a
 * function of another module's may take out of the page, where Courier
 * did not follow the function to one of TanStack Start's: why its import
 * stays, and the entry for each side, the page's module taking from the
 * root a name the page's entry leaves out.
 *
 * @param note - The file whose import leads here, and the function
 * @param names - The names the module's import takes
 * @returns The step
 * @example
 * ```ts
 * unfollowedImportFinding({ file: "src/routes/a.tsx", name: "authed", from: "@acme/kit" }, names).instead.length; // 1 for createHandler
 * ```
 */
export function unfollowedImportFinding(note: StartNote, names: readonly TakenName[]) {
  const values = names.filter(({ type }) => !type);
  const named = listed(values.map(({ name }) => name));
  const server = names.filter(({ name }) => entryTakes("server", name));
  const page = values.filter(({ name }) => entryTakes("client", name));
  const root = values.filter(({ name }) => leftToRoot("client", name));
  const fromRoot =
    root.length === 0
      ? ""
      : `, with ${listed(root.map(({ name }) => name))}, which ${CORE_ENTRIES.client} leaves out, from ${CORE_ROOT}`;
  return {
    what: `Courier could not follow ${note.name}, which ${note.file} takes from ${note.from}, to a function of TanStack Start's, whose build may take the code that imports this file out of a page, so its import stays in ${CORE_ROOT}: if only that code imports this file, take ${named} from ${CORE_ENTRIES.server}, and otherwise give the page its own module${fromRoot}`,
    instead: [
      ...(server.length > 0
        ? [importLine(server, "server", "if only that code imports this file")]
        : []),
      ...(page.length > 0 ? [importLine(page, "client", "in the page's module")] : []),
      ...(root.length > 0 ? [importLine(root, "root", "in the page's module")] : []),
    ],
  };
}
