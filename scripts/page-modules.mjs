/// <reference types="node" />
/**
 * The files a page's samples write, so that another sample of the same page
 * importing one of them compiles against it rather than against anything.
 *
 * A sample names its file in its fence's title — ```ts title="api/sources.ts"
 * — or, in a README, in a first-line comment: `// api/sources.ts`. A sample
 * importing `@/api/sources`, `~/api/sources`, `$lib/caller` or a relative
 * path of that page is pointed at it. The README taught for months an API
 * whose callers could not compile against it, while every one of those
 * imports was typed as anything and every sample passed.
 */

import { basename, join } from "node:path";
import { dirname, join as joinProjectPath, normalize } from "node:path/posix";

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const TITLE = /title="([\w@$.[\]/-]+\.(?:ts|tsx|mts))"/;
const FIRST_LINE = /^\/\/\s*([\w@$.[\]/-]+\.(?:ts|tsx|mts))\b/;
const SPECIFIER = /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(["'])([^"']+)\2/g;

/**
 * The file a sample says it is, from its fence's title or its first line.
 *
 * @param {string} info - What follows the fence's language
 * @param {string} code - The sample
 * @returns {string | undefined} The path, relative to the reader's project
 * @example
 * sampleFile(' title="api/sources.ts"', "export const a = 1\n"); // → "api/sources.ts"
 * sampleFile("", "// lib/query.ts — built once\n"); // → "lib/query.ts"
 */
export function sampleFile(info, code) {
  const named = TITLE.exec(info)?.[1] ?? FIRST_LINE.exec(code)?.[1];
  return named === undefined ? undefined : normalize(named).replace(/^\.\//, "");
}

/**
 * The project path an import of the reader's own code points at, or none
 * for a package.
 *
 * @param {string} specifier - What the sample imports
 * @param {string | undefined} from - The importing sample's own path
 * @returns {string | undefined}
 * @example
 * appPath("@/api/sources", undefined); // → "api/sources"
 * appPath("../api/sources", "lib/query.ts"); // → "api/sources"
 */
export function appPath(specifier, from) {
  const alias = /^(?:@|~~?|#app)\/(.+)$/.exec(specifier)?.[1];
  if (alias !== undefined) return normalize(alias);
  const lib = /^\$lib\/(.+)$/.exec(specifier)?.[1];
  if (lib !== undefined) return normalize(`lib/${lib}`);
  if (!specifier.startsWith(".")) return undefined;
  const joined = normalize(joinProjectPath(dirname(from ?? "index.ts"), specifier));
  return joined.startsWith("..") ? undefined : joined;
}

/**
 * Point a sample's imports of its page's files at where they are written.
 *
 * Of two samples naming one file, the last before the importing sample is
 * the one it reads, as a reader going down the page would; with none before
 * it, the first after. A file that itself imports something the page never
 * shows is not pointed at: its exports would be typed from anything, which
 * is not what the reader's code is.
 *
 * @param {{ code: string, file?: string }} sample - The importing sample
 * @param {number} index - Its place on the page
 * @param {Map<string, Array<{ index: number, written: string }>>} files - Each path the page's samples name, where each was written
 * @param {string} written - Where the importing sample is written
 * @param {(written: string) => boolean} complete - Whether a written sample imports nothing left typed as anything
 * @returns {{ code: string, unresolved: boolean }} Its code, and whether an import of the reader's code is left typed as anything
 */
export function pointImports(sample, index, files, written, complete = () => true) {
  let unresolved = false;
  const code = sample.code.replace(SPECIFIER, (match, head, quote, specifier, offset) => {
    const path = appPath(specifier, sample.file);
    if (path === undefined) return match;
    const target = definitionOf(path, index, files);
    const wanted = importedNames(sample.code.slice(sample.code.lastIndexOf("import", offset), offset));
    const found = target !== undefined && target.written !== written && complete(target.written);
    if (!found || !wanted.every((name) => exports(target.code, name))) {
      unresolved = true;
      return match;
    }
    /* Every sample is written to one directory, beside the one it imports. */
    return `${head}${quote}./${basename(target.written).replace(/\.tsx?$/, "")}${quote}`;
  });
  return { code, unresolved };
}

function definitionOf(path, index, files) {
  for (const extension of EXTENSIONS) {
    const candidates = files.get(`${path}${extension}`);
    if (candidates === undefined) continue;
    const before = candidates.filter((candidate) => candidate.index < index);
    return before.at(-1) ?? candidates[0];
  }
  return undefined;
}

/**
 * Where each sample is written, with its imports of its page's files
 * pointed at them.
 *
 * @param {Array<{ page: string, jsx: boolean, code: string, file?: string }>} samples - Every sample, page by page in reading order
 * @param {string} out - The directory they are written to
 * @returns {Map<string, { page: string, jsx: boolean, code: string, file?: string, unresolved: boolean }>}
 *   Each written path and its sample, `unresolved` when it still imports the reader's code typed as anything
 * @example
 * placeSamples([{ page: "README.md", jsx: false, code: "export const api = 1\n", file: "api.ts" }], "/tmp/out");
 * // → Map { "/tmp/out/s0.ts" => { …, unresolved: false } }
 */
export function placeSamples(samples, out) {
  const written = samples.map((sample, n) => {
    const tsx = sample.jsx || sample.file?.endsWith(".tsx");
    return join(out, `s${n}.${tsx ? "tsx" : "ts"}`);
  });
  const byPage = new Map();
  samples.forEach((sample, n) => {
    if (sample.file === undefined) return;
    const files = byPage.get(sample.page) ?? new Map();
    byPage.set(sample.page, files);
    const definition = { index: n, written: written[n], code: sample.code };
    files.set(sample.file, [...(files.get(sample.file) ?? []), definition]);
  });
  const filesOf = (n) => byPage.get(samples[n].page) ?? new Map();
  const incomplete = incompleteSamples(samples, written, filesOf);
  const complete = (path) => !incomplete.has(path);
  return new Map(
    samples.map((sample, n) => {
      const pointed = pointImports(sample, n, filesOf(n), written[n], complete);
      return [written[n], { ...sample, ...pointed }];
    }),
  );
}

/* The samples that import, at any depth, something their page never shows. */
function incompleteSamples(samples, written, filesOf) {
  const incomplete = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    samples.forEach((sample, n) => {
      if (incomplete.has(written[n])) return;
      const complete = (path) => !incomplete.has(path);
      if (!pointImports(sample, n, filesOf(n), written[n], complete).unresolved) return;
      incomplete.add(written[n]);
      changed = true;
    });
  }
  return incomplete;
}

/* The names an import statement takes by name; a default or namespace import takes none. */
function importedNames(statement) {
  const list = /\{([^}]*)\}/.exec(statement)?.[1] ?? "";
  return list
    .split(",")
    .map((entry) => entry.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0]?.trim() ?? "")
    .filter((name) => name !== "");
}

/* Whether a sample exports a name, or re-exports a module whose names it does not list. */
function exports(code, name) {
  if (/\bexport\s+\*\s+from/.test(code)) return true;
  const declared = new RegExp(
    `\\bexport\\s+(?:declare\\s+)?(?:async\\s+)?(?:const|let|var|function\\*?|class|type|interface|enum)\\s+${name}\\b`,
  );
  if (declared.test(code)) return true;
  return [...code.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)].some((match) =>
    (match[1] ?? "").split(",").some((entry) => entry.trim().split(/\s+as\s+/).at(-1)?.trim() === name),
  );
}
