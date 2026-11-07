/// <reference types="node" />
/**
 * Where the documentation's TypeScript samples are, and how each becomes a
 * module of its own for `scripts/check-doc-samples.mjs` to compile.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { codeGroupSamples } from "./code-group-samples.mjs";
import { sampleFile } from "./page-modules.mjs";
import { sideEntryOf } from "./sample-entries.mjs";

/* The side a fence says loads it, ```ts side="page", and why it shows the root, ```ts root="…". */
const SIDE = /\bside="([^"]*)"/;
const ROOT_SHOWN = /\broot="([^"]*)"/;

/* A fence may sit indented inside a component; its closing fence matches the opening indent. */
const FENCE = /^([ \t]*)```(ts|tsx|typescript)\b([^\n]*)\n([\s\S]*?)^\1```/gm;

/**
 * Every ts, tsx and typescript fence of a Markdown or MDX text, and every
 * TypeScript tab of its tabbed code, in the order the page writes them.
 *
 * @param {string} text - The page
 * @returns {Array<{ line: number, jsx: boolean, listing: boolean, code: string, file?: string, flat?: boolean }>}
 *   Each sample: the line of its first code line, whether it holds JSX,
 *   whether it lists the packages' types or signatures rather than using
 *   them, its code without the fence's indentation, the file it says it
 *   is, when it names one, and for a tab written on one line, `flat`
 * @example
 * extractSamples("# A\n\n```ts\nconst a = 1\n```\n");
 * // → [{ line: 4, jsx: false, listing: false, code: "const a = 1\n", file: undefined }]
 */
export function extractSamples(text) {
  return [...fenceSamples(text), ...codeGroupSamples(text)]
    .sort((a, b) => a.line - b.line)
    .flatMap(fileParts);
}

/* A comment naming a file, on a line of its own after a blank one: where the next file of a sample starts. */
const NEXT_FILE = /\n\n(?=\/\/\s*[\w@$.[\]/-]+\.(?:ts|tsx|mts)\b[^\n]*\n)/;

/*
 * A sample that shows two files, each under a comment naming it, is two
 * modules: the server handler's Nuxt tab sets up a plugin and a route,
 * each with its own default export.
 */
function fileParts(sample) {
  const parts = sample.code.split(NEXT_FILE);
  if (parts.length === 1) return [sample];
  let offset = 0;
  return parts.map((code, index) => {
    const part = index === parts.length - 1 ? code : `${code}\n`;
    const line = sample.flat ? sample.line : sample.line + offset;
    offset += part.split("\n").length;
    return { ...sample, line, code: part, file: index === 0 ? sample.file : sampleFile("", part) };
  });
}

function fenceSamples(text) {
  return [...text.matchAll(FENCE)].map((match) => {
    const indent = match[1] ?? "";
    const code = (match[4] ?? "")
      .split("\n")
      .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
      .join("\n");
    /* A ts fence that holds JSX is read as tsx: the fence's name is a nit, not a failure. */
    const jsx = match[2] === "tsx" || /<\/[A-Za-z]|\/>/.test(code);
    const listing =
      /title="(types|signature)"/.test(match[3] ?? "") || /^declare (function|class) /m.test(code);
    const file = sampleFile(match[3] ?? "", code);
    const side = SIDE.exec(match[3] ?? "")?.[1];
    const root = ROOT_SHOWN.exec(match[3] ?? "")?.[1];
    const line = text.slice(0, match.index).split("\n").length + 1;
    return {
      line,
      jsx,
      listing,
      code,
      file,
      ...(side !== undefined && { side }),
      ...(root !== undefined && { root }),
    };
  });
}

/**
 * The pages that hold samples: the docs site's pages and every README.
 *
 * @param {string} root - The repository root
 * @returns {string[]} Absolute paths
 * @example
 * samplePages("/repo"); // → ["/repo/docs/src/content/docs/quick-start.mdx", …, "/repo/README.md", …]
 */
export function samplePages(root) {
  const readmes = readdirSync(join(root, "packages"))
    .map((name) => join(root, "packages", name, "README.md"))
    .filter((path) => existsSync(path));
  return [...mdxFiles(join(root, "docs/src/content/docs")), join(root, "README.md"), ...readmes];
}

/**
 * The import lines a sample is missing, for names a package exports. A
 * name of the core's is imported from the entry the sample's side takes
 * it from, so a page's sample is checked against the page's caller.
 *
 * @param {Iterable<string>} missing - Names the sample uses without declaring them
 * @param {Map<string, string>} exported - Each exported name and the entry that exports it
 * @param {string} [side] - The side the sample says loads it
 * @returns {string[]} One `import { … } from "…"` line per entry
 * @example
 * importHeader(["defineApi", "courier", "users"], new Map([["defineApi", "@noverax/courier/define"], ["courier", "@noverax/courier/define"]]));
 * // → ['import { defineApi, courier } from "@noverax/courier/define";']
 */
export function importHeader(missing, exported, side) {
  const byEntry = new Map();
  for (const name of new Set(missing)) {
    const found = exported.get(name);
    const entry = found === "@noverax/courier" ? (sideEntryOf(name, side) ?? found) : found;
    if (entry) byEntry.set(entry, [...(byEntry.get(entry) ?? []), name]);
  }
  return [...byEntry].map(([entry, names]) => `import { ${names.join(", ")} } from "${entry}";`);
}

function mdxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return mdxFiles(path);
    return entry.name.endsWith(".mdx") ? [path] : [];
  });
}
