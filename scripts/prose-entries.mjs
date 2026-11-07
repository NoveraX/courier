/**
 * Which entry the prose of the docs and the READMEs tells a reader to take
 * Courier's names from. Their samples take a page's names from
 * `@noverax/courier/client` and a server's from `@noverax/courier/server`,
 * and the prose beside them says so too: prose that takes names from the
 * root, `@noverax/courier`, sends a reader's page back to the server's
 * code, which the upgrade moved out of it.
 *
 * The prose is read a paragraph at a time, its lines together, so a line
 * break does not hide what a sentence takes; a table's row is read alone.
 * Its code is no prose: its fences, and its tabbed code. A paragraph takes
 * names from the root where "from", in any case, comes before the root's
 * name, with no more between them than "the", an emphasis, a link's
 * bracket or a quote of any kind: "from the `@noverax/courier` package",
 * "From **`@noverax/courier`**", and an import written inline,
 * `import { x } from "@noverax/courier"`. An entry under the root,
 * `@noverax/courier/client` or `/realtime`, is not the root, nor is
 * another package, `@noverax/courier-react`.
 *
 * The upgrading guide's tables of the previous release, headed by its
 * version, name the imports the upgrade moves, the root's among them; the
 * rest of the guide is read as any page is.
 *
 * A page takes a name the root alone gives it, as `redact`, from the root,
 * and the prose says so in words: "the root". What a refusal tells the
 * prose to name is by the names its sentence takes from the root — the
 * names in its code that "from" comes after, or before where none comes
 * after them, and those of an import written inline — each by the entries
 * of `packages/core/entry-exports.json`: `/client`, or the root, for a
 * page's code, and `/server` for a server's. A sentence that names none of
 * the core's is told which names a page takes from the root.
 */

import { codeGroupSpans } from "./code-group-samples.mjs";
import { entriesOf, ROOT_ONLY } from "./sample-entries.mjs";

/* The root as the entry a name is taken from, with nothing after its name that makes it an entry under it or another package. */
const FROM_ROOT = /\bfrom\s+(?:the\s+)?[\s*_`"'“”‘’«»[]*@noverax\/courier(?![\w/-])/gi;
/* Any of Courier's entries a name is taken from, the root's among them. */
const FROM_ENTRY = /\bfrom\s+(?:the\s+)?[\s*_`"'“”‘’«»[]*@noverax\//gi;
/* The prose's code, and in it a name — `redact`, `createCaller(api)` — or an import written inline. */
const CODE = /`([^`]+)`/g;
const NAME = /^[A-Za-z_$][\w$]*/;
const INLINE_IMPORT = /^import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/;
/* Each name an inline import's braces take, as its entry calls it. */
const IMPORTED = /(?:^|,)\s*(?:type\s+)?([A-Za-z_$][\w$]*)/g;
/* A sentence ends at a stop, outside code. */
const STOP = /[.!?](?=\s|$)/g;
/* A fence opens and closes a block of code. */
const FENCE = /^\s*(`{3,}|~{3,})/;
const TABLE_ROW = /^\s*\|/;
/* A table of the previous release, headed by its version: `| 0.4 | Now |`. */
const RELEASE_HEADER = /^\s*\|\s*\d+(?:\.\d+)+\s*\|/;
/* The page that names the imports the upgrade moves, the root's among them. */
const UPGRADING = "docs/src/content/docs/upgrading.mdx";

const ROOT = "@noverax/courier";
const CLIENT = "@noverax/courier/client";
const SERVER = "@noverax/courier/server";
/* What to name in place of the root for a sentence that names none of the core's names. */
const ANY = `"${CLIENT}" for a page's code, or the root, as "the root", for ${[...ROOT_ONLY].join(", ")}, which it leaves out, and "${SERVER}" for a server's`;

/* Whether each line of a page is prose: none of a fence, of tabbed code, or of the upgrading guide's tables of the previous release. */
function proseLines(page, text) {
  const lines = text.split("\n");
  const prose = lines.map(() => true);
  for (const [from, to] of codeGroupSpans(text)) {
    const last = text.slice(0, to).split("\n").length - 1;
    for (let n = text.slice(0, from).split("\n").length - 1; n <= last; n++) prose[n] = false;
  }
  let fence;
  let releaseTable = false;
  lines.forEach((line, n) => {
    const marker = FENCE.exec(line)?.[1];
    if (marker !== undefined && (fence === undefined || line.trim().startsWith(fence))) {
      fence = fence === undefined ? marker : undefined;
      prose[n] = false;
    } else if (fence !== undefined) {
      prose[n] = false;
    } else if (TABLE_ROW.test(line)) {
      const header = n === 0 || !TABLE_ROW.test(lines[n - 1] ?? "");
      if (header) releaseTable = page === UPGRADING && RELEASE_HEADER.test(line);
      if (releaseTable) prose[n] = false;
    }
  });
  return { lines, prose };
}

/* The paragraphs of a page's prose, each the indexes of its lines: a run of lines, or a table's row alone. */
function paragraphsOf(lines, prose) {
  const paragraphs = [];
  let paragraph = [];
  lines.forEach((line, n) => {
    const row = TABLE_ROW.test(line);
    if (!prose[n] || line.trim() === "" || row) {
      if (paragraph.length > 0) paragraphs.push(paragraph);
      paragraph = [];
    }
    if (prose[n] && row) paragraphs.push([n]);
    else if (prose[n] && line.trim() !== "") paragraph.push(n);
  });
  if (paragraph.length > 0) paragraphs.push(paragraph);
  return paragraphs;
}

/*
 * The core's names that the "from" at an offset of a paragraph takes from
 * the root, in its sentence: each name of the sentence's code whose next
 * "from" is this one — or, with none after it, whose last one before it
 * is — and the names an inline import of the root takes.
 */
function namesTaken(joined, at) {
  const outsideCode = joined.replace(CODE, (code) => " ".repeat(code.length));
  const stops = [...outsideCode.matchAll(STOP)].map((stop) => stop.index + 1);
  const start = stops.findLast((stop) => stop <= at) ?? 0;
  const sentence = joined.slice(start, stops.find((stop) => stop > at) ?? joined.length);
  const froms = [...sentence.matchAll(FROM_ENTRY)].map((from) => start + from.index);
  const names = [...sentence.matchAll(CODE)].flatMap((code) => {
    const [, braces, entry] = INLINE_IMPORT.exec(code[1]) ?? [];
    if (braces !== undefined) {
      return entry === ROOT ? [...braces.matchAll(IMPORTED)].map(([, name]) => name) : [];
    }
    const index = start + code.index;
    const from = froms.find((from) => from > index) ?? froms.findLast((from) => from < index);
    const name = NAME.exec(code[1])?.[0];
    return name !== undefined && from === at ? [name] : [];
  });
  return [...new Set(names)].filter((name) => Object.keys(entriesOf(name)).length > 0);
}

/* A refusal of the prose: the names it takes from the root, and what to name in place of the root for them. */
function refusal(names) {
  const taken = names.length === 0 ? "names" : names.join(", ");
  return `the prose takes ${taken} from "${ROOT}": name the entry of the side it speaks of, ${names.length === 0 ? ANY : entriesFor(names)}`;
}

/* The entry of each side for each name, the names whose sides take the same ones together. */
function entriesFor(names) {
  const groups = new Map();
  for (const name of names) {
    const { page, server } = entriesOf(name);
    const key = `${page} ${server}`;
    groups.set(key, { page, server, names: [...(groups.get(key)?.names ?? []), name] });
  }
  return [...groups.values()]
    .map(({ page, server, names: named }) => {
      const entries = entriesSaid(page, server, named.length === 1 ? "it" : "them");
      return groups.size === 1 ? entries : `for ${named.join(", ")}, ${entries}`;
    })
    .join("; ");
}

/* Each side's entry for names both sides take from the same ones, or the one entry that gives them. */
function entriesSaid(page, server, it) {
  const pages =
    page === ROOT
      ? `the root for a page's code, as "the root", since "${CLIENT}" leaves ${it} out`
      : `"${page}" for a page's code`;
  if (page !== undefined && server !== undefined) return `${pages}, "${server}" for a server's`;
  return page === ROOT ? pages : `"${page ?? server}", which alone gives ${it}`;
}

/**
 * Where the prose of the docs' pages and the READMEs takes names from the
 * root.
 *
 * @param {Array<{ page: string, text: string }>} pages - Each page, by its path from the repository's root
 * @returns {string[]} One `page:line message` for each line of prose a paragraph takes names from the root on
 * @example
 * proseProblems([{ page: "docs/a.mdx", text: "Narrow it with `isHTTPError` from\n`@noverax/courier`.\n" }]);
 * // → ['docs/a.mdx:1 the prose takes isHTTPError from "@noverax/courier": name the entry of the side it speaks of, …']
 */
export function proseProblems(pages) {
  return pages.flatMap(({ page, text }) => {
    const { lines, prose } = proseLines(page, text);
    return paragraphsOf(lines, prose).flatMap((paragraph) => {
      /* The lines joined by a space each, so an offset of the paragraph falls on the line it is on. */
      const joined = paragraph.map((n) => lines[n]).join(" ");
      const starts = paragraph.map((_, at) =>
        paragraph.slice(0, at).reduce((length, n) => length + (lines[n]?.length ?? 0) + 1, 0),
      );
      const taken = new Map();
      for (const match of joined.matchAll(FROM_ROOT)) {
        const line = paragraph[starts.findLastIndex((start) => start <= match.index)] + 1;
        const names = [...(taken.get(line) ?? []), ...namesTaken(joined, match.index)];
        taken.set(line, [...new Set(names)]);
      }
      return [...taken].map(([line, names]) => `${page}:${line} ${refusal(names)}`);
    });
  });
}
