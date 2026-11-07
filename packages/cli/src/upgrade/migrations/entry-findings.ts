import {
  bindsOtherwise,
  CORE_ENTRIES,
  CORE_ROOT,
  type EntrySide,
  entryTakes,
  leftToRoot,
} from "../entries/entry-names";
import type { PieceSide } from "../entries/piece-sides";

/** A name a declaration of the root's takes, and whether it takes it as a type. */
export interface TakenName {
  readonly name: string;
  readonly type: boolean;
}

/**
 * Names as a sentence lists them.
 *
 * @param names - The names
 * @returns `a`, `a and b`, `a, b and c`
 * @example
 * ```ts
 * listed(["createCaller", "isHTTPError"]); // "createCaller and isHTTPError"
 * ```
 */
export function listed(names: readonly string[]): string {
  return names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * An import of names from one of the core's entries, as a step left to
 * the person writes it, with what it is for.
 *
 * @param names - The names, each as a type or not
 * @param side - The entry
 * @param note - What the line is for, after it, where it says one
 * @returns The line
 * @example
 * ```ts
 * importLine([{ name: "isHTTPError", type: false }], "client"); // 'import { isHTTPError } from "@noverax/courier/client";'
 * ```
 */
export function importLine(
  names: readonly TakenName[],
  side: EntrySide | "root",
  note?: string,
): string {
  const named = names.map(({ name, type }) => (type ? `type ${name}` : name)).join(", ");
  const line = `import { ${named} } from "${side === "root" ? CORE_ROOT : CORE_ENTRIES[side]}";`;
  return note === undefined ? line : `${line} // ${note}`;
}

/* The names a declaration takes that the page's entry leaves to the root, and how a step says where a page takes them. */
function rootNames(names: readonly TakenName[]) {
  const root = names.filter(({ name }) => leftToRoot("client", name));
  const named = listed(root.map(({ name }) => name));
  const it = root.length === 1 ? "it" : "them";
  const clause = root.length === 0 ? "" : `, but ${named}, which it leaves out, from ${CORE_ROOT}`;
  return { root, named, it, clause };
}

/**
 * What a page is told that takes from the root a name the page's entry
 * leaves out, as `redact`: that the import stays, as a page takes the
 * name from there, and, beside names the page's entry gives, where each
 * goes.
 *
 * @param names - The names the declaration takes
 * @returns The step
 * @example
 * ```ts
 * rootOnlyFinding([{ name: "redact", type: false }]).instead; // []
 * ```
 */
export function rootOnlyFinding(names: readonly TakenName[]) {
  const { root, named, it } = rootNames(names);
  const page = names.filter(
    ({ name }) => !leftToRoot("client", name) && entryTakes("client", name),
  );
  return {
    what: `${CORE_ENTRIES.client} leaves ${named} out, so a page takes ${it} from ${CORE_ROOT}: the import stays there`,
    instead:
      page.length === 0
        ? []
        : [
            importLine(page, "client"),
            importLine(root, "root", `a page takes ${it} from the root`),
          ],
  };
}

/** What a page that names the server's names is told: which, and what to import where. */
export function serverNamesFinding(names: readonly TakenName[]) {
  const page = names.filter(({ name }) => entryTakes("client", name));
  const { root, it } = rootNames(names);
  const server = names.filter(
    ({ name }) =>
      !entryTakes("client", name) && entryTakes("server", name) && !leftToRoot("client", name),
  );
  const verb = server.length === 1 ? "is" : "are";
  return {
    what: `a page loads this file, and ${listed(server.map(({ name }) => name))} ${verb} the server's, which a page cannot take from ${CORE_ENTRIES.client}: the import stays in ${CORE_ROOT}, and the page's bundle takes the server's part with it`,
    instead: [
      ...(page.length > 0 ? [importLine(page, "client")] : []),
      ...(root.length > 0 ? [importLine(root, "root", `a page takes ${it} from the root`)] : []),
      importLine(server, "server", "in a module only the server loads"),
    ],
  };
}

/* How the server reaches a file, as a finding says it: the root it comes from first — where it loads the file, or may — or what Courier could not read or follow on the way. */
function serverLead(side: PieceSide): string {
  const via = side.serverVia;
  if (via !== undefined && "root" in via)
    return `the server ${via.may === true ? "may load" : "loads"} this file too, as ${via.root} leads to it`;
  if (via !== undefined && "unread" in via)
    return `Courier did not read ${via.unread}, which the server may load, so the server may load this file too`;
  if (via !== undefined)
    return `the server loads ${via.package} by its name, whose entry Courier could not follow, so it may load this file too`;
  return side.incomplete
    ? "Courier did not read every file of this package, so the server may load this file too"
    : "the server loads this file too";
}

/** What a file both sides load is told where it takes a name the page's entry binds otherwise: why the import stays, how the server reaches the file, and what to write instead. */
export function serverCallerFinding(side: PieceSide, names: readonly TakenName[]) {
  const lead = serverLead(side);
  const named = listed(names.map(({ name }) => name));
  const verb = names.length === 1 ? "is" : "are";
  return {
    what: `${lead}, where ${named} from ${CORE_ROOT} ${verb} the server's caller, so the import stays there, and the page's bundle takes the server's part with it: give the page its own module, with ${named} from ${CORE_ENTRIES.client}, and the server its own, with ${named} from ${CORE_ENTRIES.server}`,
    instead: [
      importLine(names, "client", "in the page's module"),
      importLine(names, "server", "in the server's module"),
    ],
  };
}

/** What a file is told whose side the workspace does not tell: why, and the import for either side. */
export function untoldFinding(side: PieceSide, names: readonly TakenName[] | undefined) {
  const why =
    side.framework === undefined
      ? "Courier knows no framework of this package's, so whether a page or the server loads this file is not told"
      : "neither the framework's rules nor the imports Courier reads have a page or the server load this file";
  const known = names ?? [];
  const { root, clause } = rootNames(known);
  const rest = known.filter(({ name }) => !leftToRoot("client", name));
  const takes = (each: EntrySide, from: readonly TakenName[]) =>
    known.length > 0 && from.every(({ name }) => entryTakes(each, name));
  const page = takes("client", rest);
  return {
    what: `${why}, so its import stays in ${CORE_ROOT}: take it from ${CORE_ENTRIES.client} where a page loads the file${clause}, and from ${CORE_ENTRIES.server} where only the server does`,
    instead: [
      ...(page && rest.length > 0 ? [importLine(rest, "client", "where a page loads it")] : []),
      ...(page && root.length > 0 ? [importLine(root, "root", "where a page loads it")] : []),
      ...(takes("server", known)
        ? [importLine(known, "server", "where only the server does")]
        : []),
    ],
  };
}

/** What a file is told that a page may load through a package's name whose entry Courier could not follow: why its import stays, and what to import where. */
export function throughFinding(packageName: string, names: readonly TakenName[] | undefined) {
  const known = names ?? [];
  const page = known.filter(({ name }) => entryTakes("client", name));
  const server = known.filter(
    ({ name }) =>
      (bindsOtherwise("client", name) || !entryTakes("client", name)) && entryTakes("server", name),
  );
  const { root, clause } = rootNames(known);
  return {
    what: `a page loads ${packageName} by its name, and Courier could not follow its entry to its code, so this file's import stays in ${CORE_ROOT}: take from ${CORE_ENTRIES.client} what a page loads${clause}, and from ${CORE_ENTRIES.server} what only the server does`,
    instead: [
      ...(page.length > 0 ? [importLine(page, "client", "where a page loads it")] : []),
      ...(root.length > 0 ? [importLine(root, "root", "where a page loads it")] : []),
      ...(server.length > 0 ? [importLine(server, "server", "where only the server does")] : []),
    ],
  };
}

/** What a page is told whose `import()` or `require()` of the root takes it whole: what to write instead. */
export function callFinding(call: "import()" | "require()") {
  const written = call === "import()" ? "await import" : "require";
  return {
    what: `a page loads this file, and its ${call} of ${CORE_ROOT} takes the root whole, the server's part with it: take the names it uses from ${CORE_ENTRIES.client}, as in const { isHTTPError } = ${written}("${CORE_ENTRIES.client}")`,
    instead: [],
  };
}

/** What a page is told that takes the root whole: a namespace it passes on, or `export *`. */
export function wholeFinding(star: boolean) {
  return {
    what: star
      ? `a page loads this file, and it re-exports every name of ${CORE_ROOT}, the server's among them: re-export the names a page needs, from ${CORE_ENTRIES.client}`
      : `a page loads this file, and it takes ${CORE_ROOT} whole, the server's part with it: take the names it uses from ${CORE_ENTRIES.client}`,
    instead: [],
  };
}
