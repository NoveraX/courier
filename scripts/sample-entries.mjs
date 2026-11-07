/// <reference types="node" />
/**
 * Which of the core's entries a documentation sample may import, by the
 * side that loads the sample: a page takes `@noverax/courier/client`, a
 * server `@noverax/courier/server`, and a module both load takes
 * `/client`. A sample says its side as its fence does — ```ts side="page" —
 * or as a tab of tabbed code does, `side: "server"`. The root is no
 * side's: a sample that shows it on purpose — a list of its exports, a
 * module both sides load that takes the root's `createCaller`, the
 * server's caller, or a page's code that takes a name the root alone gives
 * a page, as `redact` — says why beside it, ```ts root="…". No reason takes
 * a server's name, as `createHandler`, into code a page loads.
 *
 * The docs taught `@noverax/courier` in every sample after the core gave a
 * page and a server an entry each, page code with "use client" among them,
 * and a project the upgrade had moved took the root back from the docs.
 *
 * The entries' names are `packages/core/entry-exports.json`'s, which the
 * upgrade's migration of a project's imports reads as well, and so are the
 * names a page takes from the root alone.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = "@noverax/courier";
const CLIENT = "@noverax/courier/client";
const SERVER = "@noverax/courier/server";
const CORE = new Set([ROOT, CLIENT, SERVER]);
const SIDES = new Set(["page", "server", "both"]);

const ENTRY_EXPORTS = JSON.parse(
  readFileSync(new URL("../packages/core/entry-exports.json", import.meta.url), "utf8"),
);
/* The names `/client` binds otherwise than the root does: the page's `createCaller`. */
const OTHER_THAN_ROOT = new Set(Object.keys(ENTRY_EXPORTS["./client"].otherThanRoot));
/** The values a page takes from the root alone, as `redact`: `/client` leaves them out, and `/server` has them for a server. */
export const ROOT_ONLY = new Set(Object.keys(ENTRY_EXPORTS["./client"].rootOnly));

const NAMES = {
  [CLIENT]: new Set([...ENTRY_EXPORTS["./client"].values, ...ENTRY_EXPORTS["./client"].types]),
  [SERVER]: new Set([...ENTRY_EXPORTS["./server"].values, ...ENTRY_EXPORTS["./server"].types]),
};

/**
 * The core entry a side takes a name from, for a sample that uses the name
 * without importing it: what it would write, were it to.
 *
 * @param {string} name - A name the root exports
 * @param {string | undefined} side - The sample's side
 * @returns {string | undefined} The entry, or none where the side says nothing of it
 * @example
 * sideEntryOf("isHTTPError", "page"); // → "@noverax/courier/client"
 * sideEntryOf("createCaller", "both"); // → undefined: the root's, the server's caller
 */
export function sideEntryOf(name, side) {
  const entry =
    side === "server"
      ? SERVER
      : side === "page" || (side === "both" && !OTHER_THAN_ROOT.has(name))
        ? CLIENT
        : undefined;
  return entry !== undefined && NAMES[entry].has(name) ? entry : undefined;
}

/**
 * The entry a page's code and a server's take a name of the core from: a
 * page's entry, or the root for a name the root alone gives a page, and
 * the server's.
 *
 * @param {string} name - A value or a type
 * @returns {{ page?: string, server?: string }} Each side's entry, and none for a side no entry gives the name
 * @example
 * entriesOf("redact"); // → { page: "@noverax/courier", server: "@noverax/courier/server" }
 * entriesOf("createHandler"); // → { server: "@noverax/courier/server" }: the server's
 */
export function entriesOf(name) {
  const page = NAMES[CLIENT].has(name) ? CLIENT : ROOT_ONLY.has(name) ? ROOT : undefined;
  return {
    ...(page !== undefined && { page }),
    ...(NAMES[SERVER].has(name) && { server: SERVER }),
  };
}

/** The entry each side takes Courier's names from, and why. */
const WANTED = {
  page: `take its names from "${CLIENT}", which leaves the server's part out of the page`,
  server: `take its names from "${SERVER}"`,
  both: `take its names from "${CLIENT}"; the root's ${[...OTHER_THAN_ROOT].join(", ")}, the server's caller, only with its reason in root="…" — or split the module, so a page never loads the server's caller`,
};
const WHO = {
  page: "a page's sample",
  server: "a server's sample",
  both: "a sample both sides load",
};

/**
 * What is wrong with the core entries the samples import.
 *
 * @param {Array<{ page: string, line: number, code: string, side?: string, root?: string, flat?: boolean }>} samples - Each sample, with the side its fence or tab names, and why it shows the root, where it does
 * @returns {string[]} One `page:line message` for each declaration a side does not take
 * @example
 * entryProblems([{ page: "a.mdx", line: 4, side: "page", code: 'import { isHTTPError } from "@noverax/courier"\n' }]);
 * // → ['a.mdx:4 a page\'s sample imports "@noverax/courier": take its names from "@noverax/courier/client", …']
 */
export function entryProblems(samples) {
  return samples.flatMap((sample) => {
    const at = (line) => `${sample.page}:${sample.flat ? sample.line : sample.line + line}`;
    if (sample.side !== undefined && !SIDES.has(sample.side)) {
      return [`${at(0)} side="${sample.side}" names no side: page, server or both`];
    }
    if (sample.root !== undefined && sample.root.trim() === "") {
      return [`${at(0)} root="" says no reason the sample shows "${ROOT}"`];
    }
    return coreImports(sample.code).flatMap((found) => {
      const problem =
        serversProblem(found, sample.side) ??
        (found.source === ROOT && sample.root !== undefined
          ? undefined
          : problemOf(found, sample.side));
      return problem === undefined ? [] : [`${at(found.line)} ${problem}`];
    });
  });
}

/* A server's value in code a page loads, from whichever entry and whatever its reason: a page takes it from none. */
function serversProblem({ source, typeOnly, names }, side) {
  if (typeOnly || (side !== "page" && side !== "both")) return undefined;
  const servers = (names ?? []).filter((name) => {
    const entries = entriesOf(name);
    return entries.page === undefined && entries.server !== undefined;
  });
  if (servers.length === 0) return undefined;
  const [is, it] = servers.length === 1 ? ["is", "it"] : ["are", "them"];
  return `${WHO[side]} imports "${source}": ${servers.join(", ")} ${is} the server's, from "${SERVER}" — make the sample side="server", or leave ${it} to a server's sample`;
}

function problemOf({ source, typeOnly, names }, side) {
  if (typeOnly) {
    return source === ROOT
      ? `a sample takes types from "${ROOT}": take them from "${CLIENT}" or "${SERVER}", whichever has them all`
      : undefined;
  }
  if (side === undefined) {
    return `a sample imports "${source}" and says no side: name what loads it, side="page", side="server" or side="both"`;
  }
  if (taken(source, side)) return undefined;
  /* A name the root alone gives a page, as redact: a server's code takes it from its entry, a page's from the root. */
  const rootOnly =
    side === "server" ? [] : (names ?? []).filter((name) => entriesOf(name).page === ROOT);
  if (rootOnly.length === 0) return `${WHO[side]} imports "${source}": ${WANTED[side]}`;
  const rest = rootOnly.length < (names?.length ?? 0) ? `; the rest from "${CLIENT}"` : "";
  return `${WHO[side]} imports "${source}": "${CLIENT}" does not give ${rootOnly.join(", ")}, which a server's code takes from "${SERVER}" and a page's from the root, with its reason in root="…"${rest}`;
}

/* Whether a side takes an entry: the root alone is no side's, and a sample shows it only with its reason. */
function taken(source, side) {
  if (side === "server") return source === SERVER;
  return source === CLIENT;
}

/*
 * Each declaration of a sample whose source is one of the core's entries:
 * where it is, whether it takes types alone — a namespace, a default or a
 * dynamic import takes values — and the values it names, where it names
 * them.
 */
function coreImports(code) {
  const file = ts.createSourceFile(
    "sample.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found = [];
  const lineOf = (node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line;
  const visit = (node) => {
    const source = moduleOf(node);
    if (source !== undefined && CORE.has(source))
      found.push({
        source,
        line: lineOf(node),
        typeOnly: typesAlone(node),
        names: valuesNamed(node),
      });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function moduleOf(node) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    return ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const [argument] = node.arguments;
    return argument && ts.isStringLiteralLike(argument) ? argument.text : undefined;
  }
  return undefined;
}

/* The values a declaration names, as the entry calls them; none for a namespace, a default or a dynamic import. */
function valuesNamed(node) {
  const elements = ts.isImportDeclaration(node)
    ? node.importClause?.namedBindings
    : ts.isExportDeclaration(node)
      ? node.exportClause
      : undefined;
  if (elements === undefined || !("elements" in elements)) return undefined;
  if (ts.isImportDeclaration(node) && node.importClause?.name) return undefined;
  return elements.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => (element.propertyName ?? element.name).text);
}

function typesAlone(node) {
  if (ts.isCallExpression(node)) return false;
  if (ts.isExportDeclaration(node)) {
    const clause = node.exportClause;
    if (node.isTypeOnly) return true;
    return clause !== undefined && ts.isNamedExports(clause) && namesTypesAlone(clause.elements);
  }
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  if (clause.name || !bindings || !ts.isNamedImports(bindings)) return false;
  return namesTypesAlone(bindings.elements);
}

/* Whether a list of specifiers names types alone: some, and each marked a type. */
function namesTypesAlone(elements) {
  return elements.length > 0 && elements.every((element) => element.isTypeOnly);
}
